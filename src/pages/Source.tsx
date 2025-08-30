import { useState, useEffect } from "react";
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card>
          <CardHeader>
            <CardTitle>Configuration Error</CardTitle>
            <CardDescription>
              Supabase environment variables are missing.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!data.imageUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent p-4">
      <img
        src={data.imageUrl}
        alt="Browser Source"
        className={`block max-w-full max-h-full object-contain transition-all duration-300 ease-in-out ${
          data.isRevealed
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95"
        }`}
      />
    </div>
  );
};

export default Source;