import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface SourceData {
  imageUrl: string | null;
  isRevealed: boolean;
}

const Source = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  // Log the sessionId to see if it's being correctly extracted from the URL
  console.log("Source.tsx: sessionId from URL params:", sessionId);

  const storageKey = sessionId ? `browser-source-${sessionId}` : undefined;
  // Log the storageKey that will be used
  console.log("Source.tsx: storageKey:", storageKey);

  const getStorageData = (): SourceData => {
    if (!storageKey) {
      console.log("Source.tsx: storageKey is undefined, returning default data.");
      return { imageUrl: null, isRevealed: false };
    }
    try {
      const data = localStorage.getItem(storageKey);
      // Log the raw data retrieved from localStorage
      console.log("Source.tsx: Raw data from localStorage:", data);
      const parsedData = data ? JSON.parse(data) : { imageUrl: null, isRevealed: false };
      // Log the parsed data
      console.log("Source.tsx: Parsed data:", parsedData);
      return parsedData;
    } catch (error) {
      console.error("Source.tsx: Failed to parse storage data:", error);
      return { imageUrl: null, isRevealed: false };
    }
  };

  const [data, setData] = useState<SourceData>(getStorageData);

  useEffect(() => {
    if (!storageKey) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey) {
        console.log("Source.tsx: Storage event detected for key:", event.key);
        setData(getStorageData());
      }
    };

    window.addEventListener("storage", handleStorageChange);

    const intervalId = setInterval(() => {
      const currentData = getStorageData();
      setData(prevData => {
        if (currentData.imageUrl !== prevData.imageUrl || currentData.isRevealed !== prevData.isRevealed) {
          console.log("Source.tsx: Polling detected change, updating state.");
          return currentData;
        }
        return prevData;
      });
    }, 1000);

    // Initial check on mount
    console.log("Source.tsx: Initial check on mount.");
    setData(getStorageData());

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, [storageKey]);

  // Log the final data state before rendering
  console.log("Source.tsx: Current data state for rendering:", data);

  if (!data.imageUrl) {
    console.log("Source.tsx: No imageUrl found, returning null.");
    return null;
  }

  console.log("Source.tsx: Rendering image with URL:", data.imageUrl);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent p-4">
      <img
        src={data.imageUrl}
        alt="Browser Source"
        className="block max-w-full max-h-full object-contain"
      />
    </div>
  );
};

export default Source;