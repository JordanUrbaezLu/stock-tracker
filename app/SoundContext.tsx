"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createSoundEngine, type SoundEngine, type SoundName } from "./sound";

const STORAGE_KEY = "sound_enabled";

type SoundContextValue = {
  /** Play a UI sound (no-op when muted or unsupported). */
  play: (name: SoundName) => void;
  /** Start/stop the looped "analyzing" motif. */
  startSearching: () => void;
  stopSearching: () => void;
  enabled: boolean;
  toggle: () => void;
};

// Safe no-op default so components never crash if used outside the provider.
const SoundContext = createContext<SoundContextValue>({
  play: () => {},
  startSearching: () => {},
  stopSearching: () => {},
  enabled: true,
  toggle: () => {},
});

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const engineRef = useRef<SoundEngine | null>(null);
  const loadingRef = useRef(false);
  const pendingRef = useRef<SoundName | null>(null);
  const searchingRef = useRef(false); // desired "analyzing loop" state

  // Restore the saved preference after mount. This is an intentional one-time
  // sync from localStorage — it can't be a lazy useState initializer without
  // risking a hydration mismatch on the toggle icon (server has no storage).
  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "0") {
      enabledRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(false);
    }
  }, []);

  // Lazily import + build the Tone engine. Must be kicked off from a user
  // gesture so the AudioContext can unlock. Replays any queued first sound and
  // resumes the analyzing loop if it was requested while still loading.
  const ensureEngine = useCallback(() => {
    if (engineRef.current || loadingRef.current) return;
    loadingRef.current = true;
    createSoundEngine()
      .then((engine) => {
        engineRef.current = engine;
        loadingRef.current = false;
        if (!engine || !enabledRef.current) {
          pendingRef.current = null;
          return;
        }
        if (pendingRef.current) engine.play(pendingRef.current);
        if (searchingRef.current) engine.startSearching();
        pendingRef.current = null;
      })
      .catch(() => {
        loadingRef.current = false;
      });
  }, []);

  // Warm up + unlock audio on the very first interaction anywhere.
  useEffect(() => {
    const warm = () => ensureEngine();
    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointerdown", warm, opts);
    window.addEventListener("keydown", warm, opts);
    window.addEventListener("touchstart", warm, opts);
    return () => {
      window.removeEventListener("pointerdown", warm, opts);
      window.removeEventListener("keydown", warm, opts);
      window.removeEventListener("touchstart", warm, opts);
    };
  }, [ensureEngine]);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabledRef.current) return;
      if (engineRef.current) {
        engineRef.current.play(name);
        return;
      }
      pendingRef.current = name;
      ensureEngine();
    },
    [ensureEngine],
  );

  const startSearching = useCallback(() => {
    if (!enabledRef.current) return;
    searchingRef.current = true;
    if (engineRef.current) engineRef.current.startSearching();
    else ensureEngine();
  }, [ensureEngine]);

  const stopSearching = useCallback(() => {
    searchingRef.current = false;
    engineRef.current?.stopSearching();
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      if (next) {
        play("enable"); // pleasant confirmation chime when re-enabling
      } else {
        engineRef.current?.stopSearching(); // silence any active loop
      }
      return next;
    });
  }, [play]);

  const value = useMemo(
    () => ({ play, startSearching, stopSearching, enabled, toggle }),
    [play, startSearching, stopSearching, enabled, toggle],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}
