import { useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Copy, Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const Index = () => {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const generateSession = async (newImageUrl: string) => {
    const newSessionId = Math.random().toString(36).substring(2, 10);
    setSessionId(newSessionId);
    setImageUrl(newImageUrl);
    setIsRevealed(false);

    const { error } = await supabase
      .from("sessions")
      .upsert({ id: newSessionId, image_url: newImageUrl, is_revealed: false });
    if (error) {
      console.error("Failed to create session:", error);
    }
  };

  const handleUrlSubmit = async () => {
    if (inputUrl.trim()) {
      try {
        new URL(inputUrl.trim());
        await generateSession(inputUrl.trim());
      } catch (_) {
        toast({
          variant: "destructive",
          title: "Invalid URL",
          description: "Please enter a valid image URL.",
        });
      }
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          await generateSession(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } else if (file) {
        toast({
            variant: "destructive",
            title: "Invalid File Type",
            description: "Please select an image file.",
        });
    }
  };

  const toggleReveal = async (checked: boolean) => {
    if (sessionId && imageUrl) {
      setIsRevealed(checked);
      const { error } = await supabase
        .from("sessions")
        .update({ is_revealed: checked })
        .eq("id", sessionId);
      if (error) {
        console.error("Failed to update session:", error);
      }
    }
  };

  const browserSourceUrl = sessionId
    ? `${window.location.origin}/source/${sessionId}`
    : "";

  const copyToClipboard = () => {
    if (browserSourceUrl) {
      navigator.clipboard.writeText(browserSourceUrl);
      toast({
        title: "Copied to clipboard!",
        description: "The browser source URL has been copied.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl">Image Browser Source</CardTitle>
          <CardDescription>
            Create a browser source for your images to use in OBS Studio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!sessionId ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="imageUrl">Image URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://example.com/image.png"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  />
                  <Button onClick={handleUrlSubmit}>Load</Button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload from device
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <Label>Browser Source URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={browserSourceUrl}
                    className="font-mono"
                  />
                  <Button variant="outline" size="icon" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Copy this URL and add it as a new 'Browser' source in OBS. Set width and height to your canvas size.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="reveal-switch" className="text-base">Reveal Image</Label>
                  <p className="text-sm text-muted-foreground">
                    Toggle to show or hide the image on stream.
                  </p>
                </div>
                <Switch
                  id="reveal-switch"
                  checked={isRevealed}
                  onCheckedChange={toggleReveal}
                />
              </div>

              {imageUrl && (
                <div>
                  <Label>Image Preview</Label>
                  <div className="mt-2 rounded-md border aspect-video w-full flex items-center justify-center bg-muted overflow-hidden p-4">
                    <img src={imageUrl} alt="Preview" className={`max-h-full max-w-full object-contain transition-all duration-300 ease-in-out ${
                      isRevealed
                        ? "opacity-100 scale-100"
                        : "opacity-0 scale-95"
                    }`} />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center pt-6">
            {sessionId && (
                <Button variant="link" onClick={async () => {
                    if (sessionId) {
                        await supabase.from("sessions").delete().eq("id", sessionId);
                    }
                    setSessionId(null);
                    setImageUrl("");
                    setInputUrl("");
                    setIsRevealed(false);
                }}>
                    Start over with a new image
                </Button>
            )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default Index;