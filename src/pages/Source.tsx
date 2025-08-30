import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface SourceData {
  imageUrl: string | null;
  isRevealed: boolean;
}

const Source = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const storageKey = sessionId ? `browser-source-${sessionId}` : undefined;

  const getStorageData = (): SourceData => {
    if (!storageKey) return { imageUrl: null, isRevealed: false };
    try {
      const data = localStorage.getItem(storageKey);
      return data ? JSON.parse(data) : { imageUrl: null, isRevealed: false };
    } catch (error) {
      console.error("Failed to parse storage data:", error);
      return { imageUrl: null, isRevealed: false };
    }
  };

  const [data, setData] = useState<SourceData>(getStorageData);

  useEffect(() => {
    if (!storageKey) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setData(getStorageData());
      }
    };

    window.addEventListener("storage", handleStorageChange);
    setData(getStorageData()); // Re-check on mount

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [storageKey]);

  if (!data.imageUrl) {
    // This is a transparent page, so we return null to keep the OBS source clean.
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