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

    // Listen for storage events (for changes from other tabs/windows/OBS)
    window.addEventListener("storage", handleStorageChange);

    // Also poll localStorage periodically as a fallback for environments where storage events might be unreliable (e.g., some OBS versions)
    const intervalId = setInterval(() => {
      const currentData = getStorageData();
      // Use a functional update to setData to avoid needing 'data' in useEffect dependencies
      // This ensures we always compare against the *latest* state without re-running the effect
      setData(prevData => {
        if (currentData.imageUrl !== prevData.imageUrl || currentData.isRevealed !== prevData.isRevealed) {
          return currentData;
        }
        return prevData; // No change, return previous state
      });
    }, 1000); // Check every 1 second

    // Initial check on mount
    setData(getStorageData());

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId); // Clean up the interval
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
        className="block max-w-full max-h-full object-contain" // Simplified for debugging
      />
    </div>
  );
};

export default Source;