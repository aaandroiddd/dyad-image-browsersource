import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { sectionVariants } from "@/utils/animations";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Copy, Search } from "lucide-react";

interface ElestralsCard {
  id: string;
  name: string;
  imageUrl: string;
  setNumber?: string;
  info?: string;
}

interface SourceData {
  imageUrl: string | null;
  isRevealed: boolean;
}

const PAGE_SIZE = 50;

const normalize = (value: string) => value.trim().toLowerCase();
const apiBase = (import.meta.env.VITE_ELESTRALS_API_BASE || "/api").replace(/\/+$/, "");

const parseCardPayload = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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

const extractCardsFromPayload = (payload: unknown) => {
  const fromKnown = collectCardsFromObject(payload);
  if (fromKnown.length) return fromKnown;
  const fromDeep = deepCollectCards(payload);
  if (fromDeep.length) return fromDeep;
  return [];
};

const fetchFallbackCards = async () => {
  const response = await fetch("https://www.topelestrals.com/cards");
  if (!response.ok) {
    throw new Error(`Fallback source unavailable (status ${response.status}).`);
  }
  const rawText = await response.text();
  const payload = parseCardPayload(rawText) ?? parseHtmlForJson(rawText);
  if (!payload) {
    return [];
  }
  return extractCardsFromPayload(payload);
};

const Elestrals = () => {
  const sb = supabase;
  const { toast } = useToast();
  const [cards, setCards] = useState<ElestralsCard[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<ElestralsCard | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sourceData, setSourceData] = useState<SourceData>({ imageUrl: null, isRevealed: false });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fallbackCards, setFallbackCards] = useState<ElestralsCard[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadCards = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const normalizedQuery = normalize(query);
        const params = new URLSearchParams({
          q: normalizedQuery,
          page: "1",
          pageSize: `${PAGE_SIZE}`,
        });
        const response = await fetch(`${apiBase}/elestrals/search?${params.toString()}`, { signal: controller.signal });
        const contentType = response.headers.get("content-type") ?? "";
        const responseText = await response.text();
        const isJson = contentType.includes("application/json");
        if (isJson) {
          const payload = parseCardPayload(responseText);
          if (!response.ok) {
            const details = payload && "error" in payload ? `: ${(payload as { error?: string }).error}` : "";
            setLoadError(`Unable to load card data (status ${response.status}${details}).`);
            setCards([]);
            setTotalCards(0);
            return;
          }
          if (!payload || !Array.isArray(payload.cards)) {
            const fallbackMessage = payload && "error" in payload ? String((payload as { error?: string }).error) : null;
            setLoadError(fallbackMessage || "Card data was unavailable. Please try again later.");
            setCards([]);
            setTotalCards(0);
            return;
          }
          setCards(payload.cards);
          setTotalCards(typeof payload.total === "number" ? payload.total : payload.cards.length);
          return;
        }

        const cachedFallback = fallbackCards ?? (await fetchFallbackCards());
        if (!fallbackCards) {
          setFallbackCards(cachedFallback);
        }
        if (cachedFallback.length === 0) {
          setLoadError(
            "API route not configured. Unable to read card data from https://www.topelestrals.com/cards.",
          );
          setCards([]);
          setTotalCards(0);
          return;
        }
        const filteredCards = normalizedQuery
          ? cachedFallback.filter((card) => normalize(card.name).includes(normalizedQuery))
          : cachedFallback;
        setCards(filteredCards.slice(0, PAGE_SIZE));
        setTotalCards(filteredCards.length);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Failed to load cards:", error);
        setLoadError(
          "Unable to load card data. Ensure the Elestrals API route is configured or allow access to https://www.topelestrals.com/cards.",
        );
        setCards([]);
        setTotalCards(0);
      } finally {
        setIsLoading(false);
      }
    };

    void loadCards();
    return () => {
      controller.abort();
    };
  }, [query]);

  if (!sb) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-background text-foreground">
        <motion.div variants={sectionVariants} initial="hidden" animate="visible" whileHover="hover">
          <Card className="bg-card border border-primary/50 shadow-lg shadow-[0_0_15px_hsl(var(--glow)/0.2)]">
            <CardHeader>
              <CardTitle>Configuration Error</CardTitle>
              <CardDescription>Supabase environment variables are missing.</CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  const client = sb as NonNullable<typeof sb>;

  const ensureSession = async (newImageUrl: string) => {
    if (sessionId) {
      await client
        .from("sessions")
        .update({ image_url: newImageUrl, is_revealed: false })
        .eq("id", sessionId);
      setSourceData({ imageUrl: newImageUrl, isRevealed: false });
      return;
    }

    const newSessionId = Math.random().toString(36).substring(2, 10);
    const { error } = await client
      .from("sessions")
      .upsert({ id: newSessionId, image_url: newImageUrl, is_revealed: false });

    if (error) {
      console.error("Failed to create session:", error);
      toast({
        variant: "destructive",
        title: "Session Error",
        description: "Failed to create session. Please try again.",
      });
      return;
    }

    setSessionId(newSessionId);
    setSourceData({ imageUrl: newImageUrl, isRevealed: false });
  };

  const handleSelectCard = async (card: ElestralsCard) => {
    setSelectedCard(card);
    await ensureSession(card.imageUrl);
  };

  const toggleReveal = async (checked: boolean) => {
    if (!sessionId || !sourceData.imageUrl) return;
    setSourceData((prev) => ({ ...prev, isRevealed: checked }));
    const { error } = await client
      .from("sessions")
      .update({ is_revealed: checked })
      .eq("id", sessionId);
    if (error) {
      console.error("Failed to update session:", error);
    }
  };

  const browserSourceUrl = sessionId ? `${window.location.origin}/source/${sessionId}` : "";

  const copyToClipboard = () => {
    if (!browserSourceUrl) return;
    navigator.clipboard.writeText(browserSourceUrl);
    toast({
      title: "Copied to clipboard!",
      description: "The browser source URL has been copied.",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-8 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <motion.div
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        whileHover="hover"
        className="w-full max-w-5xl"
      >
        <Card className="bg-card border border-primary/50 shadow-lg shadow-[0_0_15px_hsl(var(--glow)/0.2)]">
          <CardHeader>
            <CardTitle className="text-3xl">Elestrals Card Finder</CardTitle>
            <CardDescription>
              Search cards from the Elestrals collection, preview the details, and generate a browser source URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="card-search">Search cards</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="card-search"
                    placeholder="Type a card name..."
                    className="pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <Badge variant="secondary" className="self-center">
                  {totalCards} cards
                </Badge>
              </div>
              {loadError && <p className="text-sm text-destructive">{loadError}</p>}
              {isLoading && <p className="text-sm text-muted-foreground">Loading cards…</p>}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="bg-muted/20 border border-primary/30">
                <CardHeader>
                  <CardTitle className="text-lg">Search results</CardTitle>
                  <CardDescription>Results are filtered server-side by your search query.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[320px] pr-2">
                    <div className="space-y-2">
                      {!isLoading && cards.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No cards match that search. Try another name.
                        </p>
                      )}
                      {cards.map((card) => (
                        <button
                          type="button"
                          key={card.id}
                          className={`w-full text-left rounded-md border px-3 py-2 transition ${
                            selectedCard?.id === card.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/60 hover:bg-primary/5"
                          }`}
                          onClick={() => handleSelectCard(card)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-medium">{card.name}</p>
                              {card.setNumber && (
                                <p className="text-xs text-muted-foreground">Set {card.setNumber}</p>
                              )}
                            </div>
                            {card.setNumber && <Badge variant="outline">#{card.setNumber}</Badge>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="bg-muted/20 border border-primary/30">
                <CardHeader>
                  <CardTitle className="text-lg">Selected card</CardTitle>
                  <CardDescription>Choose a card to preview details and generate a URL.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCard ? (
                    <>
                      <div className="rounded-md border border-primary/40 bg-background/80 p-3">
                        <div className="flex items-start gap-3">
                          <div className="h-32 w-24 flex-shrink-0 overflow-hidden rounded-md border border-primary/20 bg-muted">
                            <img
                              src={selectedCard.imageUrl}
                              alt={selectedCard.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="space-y-2">
                            <div>
                              <h3 className="text-lg font-semibold">{selectedCard.name}</h3>
                              {selectedCard.setNumber && (
                                <p className="text-sm text-muted-foreground">
                                  Set number: {selectedCard.setNumber}
                                </p>
                              )}
                            </div>
                            {selectedCard.info && (
                              <p className="text-sm text-muted-foreground whitespace-pre-line">
                                {selectedCard.info}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {browserSourceUrl && (
                        <div className="space-y-2">
                          <Label>Browser Source URL</Label>
                          <div className="flex gap-2">
                            <Input readOnly value={browserSourceUrl} className="font-mono" />
                            <Button
                              variant="outline"
                              size="icon"
                              className="border-primary text-primary hover:bg-primary/10"
                              onClick={copyToClipboard}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Use this URL as a browser source in OBS, just like the home page.
                          </p>
                        </div>
                      )}

                      {sourceData.imageUrl && (
                        <div className="flex items-center justify-between rounded-lg border border-primary/50 p-3 bg-muted">
                          <div className="space-y-0.5">
                            <Label htmlFor="reveal-switch" className="text-sm">
                              Reveal Image
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Toggle to show or hide the card art on stream.
                            </p>
                          </div>
                          <Switch
                            id="reveal-switch"
                            checked={sourceData.isRevealed}
                            onCheckedChange={toggleReveal}
                          />
                        </div>
                      )}

                      {sourceData.imageUrl && (
                        <motion.div variants={sectionVariants} initial="hidden" animate="visible" whileHover="hover">
                          <Label>Image Preview</Label>
                          <div className="mt-2 rounded-md border border-primary/50 aspect-[3/4] w-full flex items-center justify-center bg-muted overflow-hidden p-4 shadow-inner shadow-[0_0_15px_hsl(var(--glow)/0.2)]">
                            <AnimatePresence mode="wait">
                              <motion.img
                                key={sourceData.imageUrl}
                                src={sourceData.imageUrl}
                                alt="Preview"
                                className="max-h-full max-w-full object-contain"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{
                                  opacity: sourceData.isRevealed ? 1 : 0,
                                  scale: sourceData.isRevealed ? 1 : 0.97,
                                }}
                                exit={{ opacity: 0, scale: 0.97 }}
                                transition={{ duration: 0.45, ease: "easeOut" }}
                              />
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a card from the list to see details and generate a browser source URL.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Elestrals;
