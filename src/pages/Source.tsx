import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

interface SourceData {
  imageUrl: string | null;
  isRevealed: boolean;
}

const Source = () => {
  const { sessionId } = useParams<{ sessionId: string }>();

  const fetchData = async (): Promise<SourceData> => {
    if (!sessionId) {
      return { imageUrl: null, isRevealed: false };
    }
    const { data, error } = await supabase
      .from("sessions")
      .select("image_url, is_revealed")
      .eq("id", sessionId)
      .single();
    if (error) {
      console.error("Failed to fetch session data:", error);
      return { imageUrl: null, isRevealed: false };
    }
    return {
      imageUrl: data?.image_url ?? null,
      isRevealed: data?.is_revealed ?? false,
    };
  };

  const [data, setData] = useState<SourceData>({ imageUrl: null, isRevealed: false });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const fetched = await fetchData();
      if (isMounted) {
        setData(fetched);
      }
    };

    load();
    const intervalId = setInterval(load, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [sessionId]);

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