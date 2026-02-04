import { readFile, writeFile } from "fs/promises";
import path from "path";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "server/data/elestrals-cards-snapshot.json");

const CARD_SOURCES = {
  base: [
    "https://collect.elestrals.com/api/cards?base_card=true",
    "https://collect.elestrals.com/cards.json",
    "https://collect.elestrals.com/api/cards",
  ],
  all: [
    "https://collect.elestrals.com/api/cards",
    "https://collect.elestrals.com/cards.json",
  ],
};

const normalizeValue = (value) => (value === null || value === undefined ? undefined : String(value).trim());

const buildCard = (raw, fallbackId) => {
  const name = normalizeValue(raw.name) ?? normalizeValue(raw.cardName) ?? normalizeValue(raw.title);
  const imageUrl =
    normalizeValue(raw.imageUrl) ??
    normalizeValue(raw.image_url) ??
    normalizeValue(raw.image) ??
    normalizeValue(raw.img) ??
    normalizeValue(raw.cardImage);
  if (!name || !imageUrl) return null;

  const setNumber =
    normalizeValue(raw.setNumber) ??
    normalizeValue(raw.set_number) ??
    normalizeValue(raw.cardNumber) ??
    normalizeValue(raw.number) ??
    normalizeValue(raw.set);
  const info =
    normalizeValue(raw.info) ??
    normalizeValue(raw.text) ??
    normalizeValue(raw.description) ??
    normalizeValue(raw.effect);
  const id =
    normalizeValue(raw.id) ??
    normalizeValue(raw.slug) ??
    normalizeValue(raw.uuid) ??
    `${name}-${setNumber ?? fallbackId}`;

  return {
    id,
    name,
    imageUrl,
    setNumber: setNumber || undefined,
    info: info || undefined,
  };
};

const collectCardsFromArray = (items) =>
  items
    .map((item, index) => (item && typeof item === "object" ? buildCard(item, `${index}`) : null))
    .filter(Boolean);

const collectCardsFromObject = (payload) => {
  if (!payload || typeof payload !== "object") return [];
  const record = payload;
  const keys = ["cards", "data", "items", "results"];
  const possibleArrays = [];
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

const deepCollectCards = (payload) => {
  const results = [];
  const visited = new Set();

  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = value;
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

const fetchCardsFromJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (status ${response.status}${response.statusText ? ` ${response.statusText}` : ""})`);
  }
  const payload = await response.json();
  const fromKnown = collectCardsFromObject(payload);
  if (fromKnown.length) return fromKnown;
  const fromDeep = deepCollectCards(payload);
  if (fromDeep.length) return fromDeep;
  return [];
};

const dedupeCards = (cards) => {
  const seen = new Set();
  return cards.filter((card) => {
    const key = `${card.name}-${card.setNumber ?? ""}-${card.imageUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const emptySnapshot = () => ({
  updatedAt: 0,
  datasets: {
    base: { updatedAt: 0, cards: [] },
    all: { updatedAt: 0, cards: [] },
  },
});

const readSnapshot = async () => {
  try {
    const contents = await readFile(SNAPSHOT_PATH, "utf8");
    const payload = JSON.parse(contents);
    if (Array.isArray(payload.cards)) {
      const updatedAt = typeof payload.updatedAt === "number" ? payload.updatedAt : 0;
      return {
        updatedAt,
        datasets: {
          base: { updatedAt, cards: payload.cards },
          all: { updatedAt, cards: payload.cards },
        },
      };
    }
    return {
      updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : 0,
      datasets: {
        base: {
          updatedAt: payload.datasets?.base?.updatedAt ?? 0,
          cards: Array.isArray(payload.datasets?.base?.cards) ? payload.datasets?.base?.cards : [],
        },
        all: {
          updatedAt: payload.datasets?.all?.updatedAt ?? 0,
          cards: Array.isArray(payload.datasets?.all?.cards) ? payload.datasets?.all?.cards : [],
        },
      },
    };
  } catch {
    return emptySnapshot();
  }
};

const writeSnapshot = async (cacheKey, cards) => {
  const existing = await readSnapshot();
  const updatedAt = Date.now();
  const payload = {
    updatedAt,
    datasets: {
      ...existing.datasets,
      [cacheKey]: {
        updatedAt,
        cards,
      },
    },
  };
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload.datasets[cacheKey];
};

const refreshSnapshot = async (cacheKey) => {
  const errors = [];
  for (const url of CARD_SOURCES[cacheKey]) {
    try {
      const cards = await fetchCardsFromJson(url);
      if (cards.length) {
        const deduped = dedupeCards(cards);
        await writeSnapshot(cacheKey, deduped);
        return { cards: deduped, source: url, errors };
      }
    } catch (error) {
      errors.push(`${url}: ${String(error)}`);
    }
  }
  return { cards: [], source: null, errors };
};

const parseArgs = (args) => {
  const argSet = new Set(args);
  const wantsAll = argSet.has("--all");
  const wantsBase = argSet.has("--base") || (!wantsAll && !argSet.has("--all"));
  return { wantsAll, wantsBase };
};

const run = async () => {
  const { wantsAll, wantsBase } = parseArgs(process.argv.slice(2));
  const results = [];

  if (wantsBase) {
    const base = await refreshSnapshot("base");
    results.push({ key: "base", count: base.cards.length, source: base.source, errors: base.errors });
  }

  if (wantsAll) {
    const all = await refreshSnapshot("all");
    results.push({ key: "all", count: all.cards.length, source: all.source, errors: all.errors });
  }

  const snapshot = await readSnapshot();
  for (const result of results) {
    const updatedAt = snapshot.datasets[result.key]?.updatedAt ?? 0;
    console.log(
      `[elestrals-ingest] ${result.key} -> ${result.count} cards (updatedAt=${updatedAt}, source=${result.source ?? "n/a"})`,
    );
    if (result.errors.length) {
      console.warn(`[elestrals-ingest] ${result.key} warnings:\n- ${result.errors.join("\n- ")}`);
    }
  }

  const totalFetched = results.reduce((sum, result) => sum + result.count, 0);
  if (totalFetched === 0) {
    console.error("[elestrals-ingest] No cards fetched. Check connectivity or source availability.");
    process.exitCode = 1;
  }
};

await run();
