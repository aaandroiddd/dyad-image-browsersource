/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import path from "path";

interface ElestralsCard {
  id: string;
  name: string;
  imageUrl: string;
  setNumber?: string;
  info?: string;
}

const SNAPSHOT_PATH = path.resolve(process.cwd(), "server/data/elestrals-cards-snapshot.json");
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const normalize = (value: string) => value.trim().toLowerCase();

const readSnapshot = async () => {
  try {
    const contents = await readFile(SNAPSHOT_PATH, "utf8");
    const payload = JSON.parse(contents) as { updatedAt?: number; cards?: ElestralsCard[] };
    return {
      updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : 0,
      cards: Array.isArray(payload.cards) ? payload.cards : [],
    };
  } catch {
    return { updatedAt: 0, cards: [] };
  }
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const pageParam = Number(requestUrl.searchParams.get("page") ?? "1");
  const pageSizeParam = Number(requestUrl.searchParams.get("pageSize") ?? `${DEFAULT_PAGE_SIZE}`);
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1;
  const pageSize = Number.isFinite(pageSizeParam)
    ? clampNumber(Math.floor(pageSizeParam), 1, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const snapshot = await readSnapshot();
  if (!snapshot.cards.length) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Card snapshot not available. Refresh the dataset via /api/elestrals/cards.",
      }),
    );
    return;
  }

  const normalizedQuery = normalize(query);
  const filteredCards = normalizedQuery
    ? snapshot.cards.filter((card) => normalize(card.name).includes(normalizedQuery))
    : snapshot.cards;
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
      updatedAt: snapshot.updatedAt,
      cards: pagedCards,
    }),
  );
}
