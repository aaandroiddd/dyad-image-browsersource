import { useEffect, useMemo, useState } from "react";
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

const SCORE_EXACT_MATCH = 1000;
const SCORE_PREFIX_MATCH = 800;
const SCORE_INCLUDES_MATCH = 500;
const SCORE_FUZZY_MATCH = 200;
const MAX_RESULTS = 50;

const normalize = (value: string) => value.trim().toLowerCase();

const parseCardPayload = (rawText: string) => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const getFuzzyScore = (name: string, query: string) => {
  let nameIndex = 0;
  let queryIndex = 0;
  let gaps = 0;
  while (nameIndex < name.length && queryIndex < query.length) {
    if (name[nameIndex] === query[queryIndex]) {
      queryIndex += 1;
    } else {
      gaps += 1;
    }
    nameIndex += 1;
  }
  if (queryIndex !== query.length) return 0;
  const ratio = query.length / name.length;
  return SCORE_FUZZY_MATCH + Math.round(ratio * 100) - gaps;
};

const scoreCard = (cardName: string, query: string) => {
  if (!query) return 0;
  const name = normalize(cardName);
  if (name === query) return SCORE_EXACT_MATCH;
  if (name.startsWith(query)) {
    return SCORE_PREFIX_MATCH + Math.max(0, 50 - (name.length - query.length));
  }
  const index = name.indexOf(query);
  if (index >= 0) {
    return SCORE_INCLUDES_MATCH - index;
  }
  return getFuzzyScore(name, query);
};

const Elestrals = () => {
  const sb = supabase;
  const { toast } = useToast();
  const [cards, setCards] = useState<ElestralsCard[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<ElestralsCard | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sourceData, setSourceData] = useState<SourceData>({ imageUrl: null, isRevealed: false });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadCards = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/elestrals/cards");
        const responseText = await response.text();
        const payload = parseCardPayload(responseText);
        if (!response.ok) {
          const details = payload && "details" in payload ? `: ${(payload as { details?: string }).details}` : "";
          if (isMounted) {
            setLoadError(`Unable to load card data (status ${response.status}${details}).`);
            setCards([]);
          }
          return;
        }
        if (!payload || !Array.isArray(payload.cards)) {
          const fallbackMessage = payload && "error" in payload ? String((payload as { error?: string }).error) : null;
          if (isMounted) {
            setLoadError(fallbackMessage || "Card data was unavailable. Please try again later.");
            setCards([]);
          }
          return;
        }
        if (isMounted) {
          setCards(payload.cards);
        }
      } catch (error) {
        console.error("Failed to load cards:", error);
        if (isMounted) {
          setLoadError("Unable to load card data. Please try again later.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCards();
    return () => {
      isMounted = false;
    };
  }, []);

  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return cards.slice(0, MAX_RESULTS);
    }
    return cards
      .map((card) => ({
        card,
        score: scoreCard(card.name, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score === a.score) {
          return a.card.name.localeCompare(b.card.name);
        }
        return b.score - a.score;
      })
      .slice(0, MAX_RESULTS)
      .map((result) => result.card);
  }, [cards, query]);

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
                  {cards.length} cards
                </Badge>
              </div>
              {loadError && <p className="text-sm text-destructive">{loadError}</p>}
              {isLoading && <p className="text-sm text-muted-foreground">Loading cards…</p>}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="bg-muted/20 border border-primary/30">
                <CardHeader>
                  <CardTitle className="text-lg">Search results</CardTitle>
                  <CardDescription>Exact matches appear first, followed by fuzzy matches.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[320px] pr-2">
                    <div className="space-y-2">
                      {!isLoading && results.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No cards match that search. Try another name.
                        </p>
                      )}
                      {results.map((card) => (
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
