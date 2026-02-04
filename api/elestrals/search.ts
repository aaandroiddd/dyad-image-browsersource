/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";
import { readSnapshot, refreshSnapshot } from "../../server/elestrals/cards.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const normalize = (value: string) => value.trim().toLowerCase();

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const baseCardParam = requestUrl.searchParams.get("base_card") ?? requestUrl.searchParams.get("baseCard");
  const baseCardOnly = baseCardParam
    ? !["0", "false", "no"].includes(baseCardParam.toLowerCase())
    : true;
  const cacheKey: "base" | "all" = baseCardOnly ? "base" : "all";
  const wantsRefresh = ["1", "true", "yes"].includes((requestUrl.searchParams.get("refresh") ?? "").toLowerCase());
  const remoteAllowed = process.env.ELESTRALS_REMOTE_FETCH === "true" || process.env.NODE_ENV !== "production";
  const pageParam = Number(requestUrl.searchParams.get("page") ?? "1");
  const pageSizeParam = Number(requestUrl.searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`);
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1;
  const pageSize = Number.isFinite(pageSizeParam)
    ? clampNumber(Math.floor(pageSizeParam), 1, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const snapshot = await readSnapshot();
  const initialDataset = snapshot.datasets[cacheKey];
  let dataset = initialDataset;
  let refreshErrors: string[] = [];

  if (wantsRefresh) {
    const { cards, errors } = await refreshSnapshot(cacheKey, remoteAllowed);
    refreshErrors = errors;
    if (cards.length) {
      dataset = { updatedAt: Date.now(), cards };
    }
  }

  if (!dataset.cards.length) {
    res.statusCode = wantsRefresh && remoteAllowed ? 502 : 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: wantsRefresh
          ? remoteAllowed
            ? "Unable to fetch card data."
            : "Remote fetch disabled. Run the ingestion job to build the local index."
          : "Card snapshot not available. Run the ingestion job to build the local index.",
        details: refreshErrors.length ? refreshErrors : undefined,
      }),
    );
    return;
  }

  const normalizedQuery = normalize(query);
  const filteredCards = normalizedQuery
    ? dataset.cards.filter((card) => normalize(card.name).includes(normalizedQuery))
    : dataset.cards;
  const total = filteredCards.length;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedCards = filteredCards.slice(startIndex, endIndex);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      query,
      page,
      pageSize,
      total,
      updatedAt: dataset.updatedAt,
      cards: pagedCards,
    }),
  );
}
