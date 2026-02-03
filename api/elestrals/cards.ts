/* eslint-env node */

import type { IncomingMessage, ServerResponse } from "http";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

interface ElestralsCard {
  id: string;
  name: string;
  imageUrl: string;
  setNumber?: string;
  info?: string;
}

const CACHE_TTL_MS = 1000 * 60 * 60;
const cache: Record<"base" | "all", { timestamp: number; cards: ElestralsCard[] }> = {
  base: { timestamp: 0, cards: [] },
  all: { timestamp: 0, cards: [] },
};
const SNAPSHOT_PATH = path.resolve(process.cwd(), "server/data/elestrals-cards-snapshot.json");

const CARD_SOURCES: Record<"base" | "all", { url: string; type: "json" | "html" }[]> = {
  base: [
    { url: "https://collect.elestrals.com/api/cards?base_card=true", type: "json" },
    { url: "https://collect.elestrals.com/cards?base_card=true", type: "html" },
    { url: "https://collect.elestrals.com/cards.json", type: "json" },
    { url: "https://collect.elestrals.com/api/cards", type: "json" },
    { url: "https://collect.elestrals.com/cards", type: "html" },
  ],
  all: [
    { url: "https://collect.elestrals.com/api/cards", type: "json" },
    { url: "https://collect.elestrals.com/cards", type: "html" },
    { url: "https://collect.elestrals.com/cards.json", type: "json" },
  ],
};

const normalizeValue = (value?: string | number | null) =>
  value === null || value === undefined ? undefined : String(value).trim();

const buildCard = (raw: Record<string, unknown>, fallbackId: string): ElestralsCard | null => {
  const name =
    normalizeValue(raw.name as string) ??
    normalizeValue(raw.cardName as string) ??
    normalizeValue(raw.title as string);
  const imageUrl =
    normalizeValue(raw.imageUrl as string) ??
    normalizeValue(raw.image_url as string) ??
    normalizeValue(raw.image as string) ??
    normalizeValue(raw.img as string) ??
    normalizeValue(raw.cardImage as string);
  if (!name || !imageUrl) return null;

  const setNumber =
    normalizeValue(raw.setNumber as string) ??
    normalizeValue(raw.set_number as string) ??
    normalizeValue(raw.cardNumber as string) ??
    normalizeValue(raw.number as string) ??
    normalizeValue(raw.set as string);
  const info =
    normalizeValue(raw.info as string) ??
    normalizeValue(raw.text as string) ??
    normalizeValue(raw.description as string) ??
    normalizeValue(raw.effect as string);
  const id =
    normalizeValue(raw.id as string) ??
    normalizeValue(raw.slug as string) ??
    normalizeValue(raw.uuid as string) ??
    `${name}-${setNumber ?? fallbackId}`;

  return {
    id,
    name,
    imageUrl,
    setNumber: setNumber || undefined,
    info: info || undefined,
  };
};

const collectCardsFromArray = (items: unknown[]) =>
  items
    .map((item, index) => (item && typeof item === "object" ? buildCard(item as Record<string, unknown>, `${index}`) : null))
    .filter((card): card is ElestralsCard => Boolean(card));

const collectCardsFromObject = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];
  const possibleArrays: unknown[] = [];
  const record = payload as Record<string, unknown>;
  const keys = ["cards", "data", "items", "results"];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      possibleArrays.push(...value);
    }
  }
  if (possibleArrays.length > 0) {
    return collectCardsFromArray(possibleArrays);
  }
  return [];
};

const deepCollectCards = (payload: unknown) => {
  const results: ElestralsCard[] = [];
  const visited = new Set<unknown>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const card = buildCard(record, `${results.length}`);
    if (card) {
      results.push(card);
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(payload);
  return results;
};

const parseHtmlForJson = (html: string) => {
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch?.[1]) {
    return JSON.parse(nextDataMatch[1]);
  }

  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
  if (stateMatch?.[1]) {
    return JSON.parse(stateMatch[1]);
  }

  const preloadedMatch = html.match(/__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/);
  if (preloadedMatch?.[1]) {
    return JSON.parse(preloadedMatch[1]);
  }

  return null;
};

const fetchCardsFromJson = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const payload = await response.json();
  const fromKnown = collectCardsFromObject(payload);
  if (fromKnown.length) return fromKnown;
  const fromDeep = deepCollectCards(payload);
  if (fromDeep.length) return fromDeep;
  return [];
};

const fetchCardsFromHtml = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  const html = await response.text();
  const payload = parseHtmlForJson(html);
  if (payload) {
    const fromKnown = collectCardsFromObject(payload);
    if (fromKnown.length) return fromKnown;
    const fromDeep = deepCollectCards(payload);
    if (fromDeep.length) return fromDeep;
  }
  return [];
};

const dedupeCards = (cards: ElestralsCard[]) => {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.name}-${card.setNumber ?? ""}-${card.imageUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const readSnapshot = async () => {
  try {
    const contents = await readFile(SNAPSHOT_PATH, "utf8");
    const payload = JSON.parse(contents) as { updatedAt?: number; cards?: ElestralsCard[] };
    return {
      updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : 0,
      cards: Array.isArray(payload.cards) ? payload.cards : [],
    };
  } catch (error) {
    return { updatedAt: 0, cards: [] };
  }
};

const writeSnapshot = async (cards: ElestralsCard[]) => {
  const payload = {
    updatedAt: Date.now(),
    cards,
  };
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

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

  const now = Date.now();
  if (cache[cacheKey].cards.length && now - cache[cacheKey].timestamp < CACHE_TTL_MS) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ cards: cache[cacheKey].cards, cached: true, baseCardOnly }));
    return;
  }

  const errors: string[] = [];
  for (const source of CARD_SOURCES[cacheKey]) {
    try {
      const cards =
        source.type === "json"
          ? await fetchCardsFromJson(source.url)
          : await fetchCardsFromHtml(source.url);
      if (cards.length) {
        const deduped = dedupeCards(cards);
        cache.cards = deduped;
        cache.timestamp = now;
        await writeSnapshot(deduped);
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify({ cards: deduped, cached: false, source: source.url, baseCardOnly }));
        return;
      }
    } catch (error) {
      errors.push(`${source.url}: ${String(error)}`);
    }
  }

  const snapshot = await readSnapshot();
  if (snapshot.cards.length) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        cards: snapshot.cards,
        cached: true,
        stale: true,
        snapshotUpdatedAt: snapshot.updatedAt,
        errors,
      }),
    );
    return;
  }

  res.statusCode = 502;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Unable to fetch card data.", details: errors }));
}
