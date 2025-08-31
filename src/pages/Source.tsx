import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { sectionVariants } from "@/utils/animations";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SourceData {
  imageUrl: string | null;
  isRevealed: boolean;
}

const Source = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const sb = supabase;
  const [data, setData] = useState<SourceData>({ imageUrl: null, isRevealed: false });

  useEffect(() => {
    if (!sb || !sessionId) return;

    let isMounted = true;

    const load = async () => {
      const { data, error } = await sb
        .from("sessions")
        .select("image_url, is_revealed")
        .eq("id", sessionId)
        .single();
      if (error) {
        console.error("Failed to fetch session data:", error);
        return;
      }
      if (isMounted) {
        setData({
          imageUrl: data?.image_url ?? null,
          isRevealed: data?.is_revealed ?? false,
        });
      }
    };

    load();
    const intervalId = setInterval(load, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [sb, sessionId]);

  if (!sb) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-8 bg-background text-foreground">
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          whileHover="hover"
        >
          <Card className="bg-card border border-primary/50 shadow-lg shadow-[0_0_15px_hsl(var(--glow)/0.2)]">
            <CardHeader>
              <CardTitle>Configuration Error</CardTitle>
              <CardDescription>
                Supabase environment variables are missing.
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!data.imageUrl) {
    return null;
  }

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-transparent p-4">
        <motion.img
          src={data.imageUrl}
          alt="Browser Source"
          className="block max-w-full max-h-full object-contain"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: data.isRevealed ? 1 : 0, scale: data.isRevealed ? 1 : 0.95 }}
          transition={{ duration: 0.3 }}
        />
      </div>
    );
};

export default Source;