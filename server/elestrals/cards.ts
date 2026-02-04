import { readFile, writeFile } from "fs/promises";
import path from "path";

export interface ElestralsCard {
  id: string;
  name: string;
  imageUrl: string;
  setNumber?: string;
  info?: string;
}

type CacheKey = "base" | "all";

interface SnapshotDataset {
  updatedAt: number;
  cards: ElestralsCard[];
}

interface SnapshotPayload {
  updatedAt: number;
  datasets: Record<CacheKey, SnapshotDataset>;
}

const SNAPSHOT_PATH = path.resolve(process.cwd(), "server/data/elestrals-cards-snapshot.json");

const CARD_SOURCES: Record<CacheKey, { url: string; type: "json" }[]> = {
  base: [
    { url: "https://collect.elestrals.com/api/cards?base_card=true", type: "json" },
    { url: "https://collect.elestrals.com/cards.json", type: "json" },
    { url: "https://collect.elestrals.com/api/cards", type: "json" },
  ],
  all: [
    { url: "https://collect.elestrals.com/api/cards", type: "json" },
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

const fetchCardsFromJson = async (url: string) => {
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

const dedupeCards = (cards: ElestralsCard[]) => {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.name}-${card.setNumber ?? ""}-${card.imageUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const emptySnapshot = (): SnapshotPayload => ({
  updatedAt: 0,
  datasets: {
    base: { updatedAt: 0, cards: [] },
    all: { updatedAt: 0, cards: [] },
  },
});

export const readSnapshot = async (): Promise<SnapshotPayload> => {
  try {
    const contents = await readFile(SNAPSHOT_PATH, "utf8");
    const payload = JSON.parse(contents) as Partial<SnapshotPayload> & {
      cards?: ElestralsCard[];
    };
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
  } catch (error) {
    return emptySnapshot();
  }
};

export const writeSnapshot = async (cacheKey: CacheKey, cards: ElestralsCard[]) => {
  const existing = await readSnapshot();
  const updatedAt = Date.now();
  const payload: SnapshotPayload = {
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

export const fetchCardsFromSources = async (cacheKey: CacheKey) => {
  const errors: string[] = [];
  for (const source of CARD_SOURCES[cacheKey]) {
    try {
      const cards = await fetchCardsFromJson(source.url);
      if (cards.length) {
        return { cards: dedupeCards(cards), source: source.url, errors };
      }
    } catch (error) {
      errors.push(`${source.url}: ${String(error)}`);
    }
  }
  return { cards: [], source: null, errors };
};

export const refreshSnapshot = async (cacheKey: CacheKey, allowRemote: boolean) => {
  if (!allowRemote) {
    return { cards: [], source: null, errors: ["Remote fetch disabled."] };
  }
  const { cards, source, errors } = await fetchCardsFromSources(cacheKey);
  if (cards.length) {
    await writeSnapshot(cacheKey, cards);
  }
  return { cards, source, errors };
};
