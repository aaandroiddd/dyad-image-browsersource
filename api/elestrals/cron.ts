/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";
import { readSnapshot, refreshSnapshot } from "../../server/elestrals/cards";

const parseBooleanParam = (value?: string | null) =>
  value ? !["0", "false", "no"].includes(value.toLowerCase()) : true;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const refreshBase = parseBooleanParam(requestUrl.searchParams.get("base") ?? "1");
  const refreshAll = parseBooleanParam(requestUrl.searchParams.get("all") ?? "1");
  const secret = requestUrl.searchParams.get("secret");
  const expectedSecret = process.env.ELESTRALS_CRON_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const results: Record<string, unknown> = {};
  if (refreshBase) {
    const base = await refreshSnapshot("base", true);
    results.base = { count: base.cards.length, source: base.source, errors: base.errors };
  }
  if (refreshAll) {
    const all = await refreshSnapshot("all", true);
    results.all = { count: all.cards.length, source: all.source, errors: all.errors };
  }

  const snapshot = await readSnapshot();

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      refreshedAt: Date.now(),
      snapshotUpdatedAt: snapshot.updatedAt,
      datasets: {
        base: snapshot.datasets.base.updatedAt,
        all: snapshot.datasets.all.updatedAt,
      },
      results,
    }),
  );
}
