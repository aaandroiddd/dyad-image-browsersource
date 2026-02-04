/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";
import { readSnapshot, refreshSnapshot } from "../../server/elestrals/cards";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const baseCardParam = requestUrl.searchParams.get("base_card") ?? requestUrl.searchParams.get("baseCard");
  const baseCardOnly = baseCardParam
    ? !["0", "false", "no"].includes(baseCardParam.toLowerCase())
    : true;
  const cacheKey: "base" | "all" = baseCardOnly ? "base" : "all";
  const wantsRefresh = ["1", "true", "yes"].includes((requestUrl.searchParams.get("refresh") ?? "").toLowerCase());
  const remoteAllowed =
    process.env.ELESTRALS_REMOTE_FETCH === "true" || process.env.NODE_ENV !== "production";

  const snapshot = await readSnapshot();
  const dataset = snapshot.datasets[cacheKey];

  if (!wantsRefresh && dataset.cards.length) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        cards: dataset.cards,
        cached: true,
        baseCardOnly,
        snapshotUpdatedAt: dataset.updatedAt,
      }),
    );
    return;
  }

  if (wantsRefresh) {
    const { cards, source, errors } = await refreshSnapshot(cacheKey, remoteAllowed);
    if (cards.length) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          cards,
          cached: false,
          source,
          baseCardOnly,
          refreshedAt: Date.now(),
        }),
      );
      return;
    }
    if (dataset.cards.length) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          cards: dataset.cards,
          cached: true,
          stale: true,
          baseCardOnly,
          snapshotUpdatedAt: dataset.updatedAt,
          errors,
        }),
      );
      return;
    }
    res.statusCode = remoteAllowed ? 502 : 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: remoteAllowed
          ? "Unable to fetch card data."
          : "Remote fetch disabled. Run the ingestion job to build the local index.",
        details: errors,
      }),
    );
    return;
  }

  if (!dataset.cards.length) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Card snapshot not available. Run the ingestion job to build the local index.",
      }),
    );
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ cards: dataset.cards, cached: true, baseCardOnly, snapshotUpdatedAt: dataset.updatedAt }));
}
