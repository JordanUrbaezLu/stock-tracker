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
  /** Slide sound whose pitch climbs with the slide index. */
  swipe: (index: number) => void;
  /** Start/stop the looped "analyzing" motif. */
  startSearching: () => void;
  stopSearching: () => void;
  enabled: boolean;
  toggle: () => void;
};

// Safe no-op default so components never crash if used outside the provider.
const SoundContext = createContext<SoundContextValue>({
  play: () => {},
  swipe: () => {},
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

  // Build the Tone engine (imports Tone, builds the synth graph, creates a
  // SUSPENDED audio context — no gesture needed). Doing this ahead of time is
  // what makes the unlock reliable: by the time the user taps, the engine is
  // ready so resume() can run synchronously inside the gesture (Safari/iOS
  // reject a resume scheduled after a dynamic import's await).
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
        engine.resume();
        if (pendingRef.current) engine.play(pendingRef.current);
        if (searchingRef.current) engine.startSearching();
        pendingRef.current = null;
      })
      .catch(() => {
        loadingRef.current = false;
      });
  }, []);

  // Preload the engine after mount, and unlock the audio context on the first
  // user gesture anywhere (resume runs synchronously here — Safari-safe).
  useEffect(() => {
    ensureEngine();
    const warm = () => engineRef.current?.resume();
    const opts = { capture: true } as const;
    window.addEventListener("pointerdown", warm, opts);
    window.addEventListener("touchstart", warm, opts);
    window.addEventListener("keydown", warm, opts);
    return () => {
      window.removeEventListener("pointerdown", warm, opts);
      window.removeEventListener("touchstart", warm, opts);
      window.removeEventListener("keydown", warm, opts);
    };
  }, [ensureEngine]);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabledRef.current) return;
      const engine = engineRef.current;
      if (engine) {
        engine.resume(); // keep the context unlocked (runs inside the gesture)
        engine.play(name);
        return;
      }
      pendingRef.current = name;
      ensureEngine();
    },
    [ensureEngine],
  );

  const swipe = useCallback(
    (index: number) => {
      if (!enabledRef.current) return;
      const engine = engineRef.current;
      if (engine) {
        engine.resume();
        engine.swipe(index);
      } else {
        ensureEngine(); // skip this one sound; it'll be ready next time
      }
    },
    [ensureEngine],
  );

  const startSearching = useCallback(() => {
    if (!enabledRef.current) return;
    searchingRef.current = true;
    const engine = engineRef.current;
    if (engine) {
      engine.resume();
      engine.startSearching();
    } else {
      ensureEngine();
    }
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
    () => ({ play, swipe, startSearching, stopSearching, enabled, toggle }),
    [play, swipe, startSearching, stopSearching, enabled, toggle],
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}
