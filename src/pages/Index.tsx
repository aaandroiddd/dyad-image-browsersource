import { useState, useRef, ChangeEvent } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Index = () => {
  const sb = supabase;
  const [imageUrl, setImageUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changeFileInputRef = useRef<HTMLInputElement>(null);
  const [changeUrl, setChangeUrl] = useState<string>("");
  const [isChangeDialogOpen, setIsChangeDialogOpen] = useState(false);
  const { toast } = useToast();

  if (!sb) {
    return (
      <motion.div
        className="min-h-screen flex items-center justify-center p-4 md:p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Configuration Error</CardTitle>
            <CardDescription>
              Supabase environment variables are missing. Set
              <code className="font-mono"> VITE_SUPABASE_URL </code>
              and
              <code className="font-mono"> VITE_SUPABASE_ANON_KEY </code>.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  const client = sb as NonNullable<typeof sb>;

  const generateSession = async (newImageUrl: string) => {
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
    setImageUrl(newImageUrl);
    setIsRevealed(false);
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
      const publicUrl = await uploadImage(file);
      if (publicUrl) {
        await generateSession(publicUrl);
      } else {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "Could not upload image. Please try again.",
        });
      }
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
      const { error } = await client
        .from("sessions")
        .update({ is_revealed: checked })
        .eq("id", sessionId);
      if (error) {
        console.error("Failed to update session:", error);
      }
    }
  };

  const replaceImage = async (newImageUrl: string) => {
    if (!sessionId) return;

    setIsRevealed(false);
    await client.from("sessions").update({ is_revealed: false }).eq("id", sessionId);

    await client.from("sessions").update({ image_url: newImageUrl }).eq("id", sessionId);
    setImageUrl(newImageUrl);

    setTimeout(async () => {
      setIsRevealed(true);
      await client
        .from("sessions")
        .update({ is_revealed: true })
        .eq("id", sessionId);
    }, 300);
  };

  const handleChangeUrlSubmit = async () => {
    if (changeUrl.trim()) {
      try {
        new URL(changeUrl.trim());
        await replaceImage(changeUrl.trim());
        setChangeUrl("");
        setIsChangeDialogOpen(false);
      } catch (_) {
        toast({
          variant: "destructive",
          title: "Invalid URL",
          description: "Please enter a valid image URL.",
        });
      }
    }
  };

  const handleChangeFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const publicUrl = await uploadImage(file);
      if (publicUrl) {
        await replaceImage(publicUrl);
        setIsChangeDialogOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "Could not upload image. Please try again.",
        });
      }
    } else if (file) {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please select an image file.",
      });
    }
    if (changeFileInputRef.current) {
      changeFileInputRef.current.value = "";
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
    <motion.div
      className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
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
        <CardFooter className="justify-center pt-6 flex gap-4">
            {sessionId && (
              <>
                <Button variant="link" onClick={() => setIsChangeDialogOpen(true)}>
                  Change image
                </Button>
                <Button
                  variant="link"
                  onClick={async () => {
                    if (sessionId) {
                      await client.from("sessions").delete().eq("id", sessionId);
                    }
                    setSessionId(null);
                    setImageUrl("");
                    setInputUrl("");
                    setIsRevealed(false);
                  }}
                >
                  Start over with a new image
                </Button>
              </>
            )}
        </CardFooter>
      </Card>

      <Dialog open={isChangeDialogOpen} onOpenChange={setIsChangeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change image</DialogTitle>
            <DialogDescription>
              Enter a new image URL or upload a file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="changeImageUrl">Image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="changeImageUrl"
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={changeUrl}
                  onChange={(e) => setChangeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChangeUrlSubmit()}
                />
                <Button onClick={handleChangeUrlSubmit}>Load</Button>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <div>
              <input
                type="file"
                ref={changeFileInputRef}
                onChange={handleChangeFile}
                className="hidden"
                accept="image/*"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => changeFileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload from device
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default Index;