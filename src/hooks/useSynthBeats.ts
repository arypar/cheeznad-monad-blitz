"use client";

import { useEffect, useRef } from "react";
import { createSynthEngine, SynthEngine } from "@/lib/synthBeats";

export function useSynthBeats() {
  const engineRef = useRef<SynthEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = createSynthEngine();
  }

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const handleGesture = () => {
      engine.unlock();
    };

    window.addEventListener("click", handleGesture, { once: false });
    window.addEventListener("keydown", handleGesture, { once: false });

    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, []);

  return engineRef.current;
}
