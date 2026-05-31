// Tasteful UI sound design powered by Tone.js. Sounds are synthesized at
// runtime (no audio files to ship/license) through proper ADSR envelopes,
// a softening low-pass and a limiter so nothing is harsh or clips. Tone is
// dynamically imported on first interaction, so it never touches the initial
// bundle — see SoundContext for the lazy wiring.

import type * as ToneNS from "tone";

export type SoundName =
  | "tap" // generic button / link
  | "nav" // navigating to a page (soft rising)
  | "toggle" // segmented controls, filters, sort
  | "open" // expand a card / open a menu
  | "close" // collapse / close
  | "swipe" // carousel slide change
  | "send" // chat question / search submit
  | "receive" // chat answer arrives
  | "success" // positive milestone (login, big win)
  | "coin" // money / gain accent
  | "error" // failed action
  | "pulse" // whisper tick as the graph pulse sweeps through
  | "enable" // pleasant chime when sound is switched on
  // Graded gain/loss reactions, scaled by return magnitude (louder = bigger).
  | "gainLow" // 0–50%
  | "gainMid" // 50–500%
  | "gainHigh" // 500%+
  | "lossLow" // 0 to -25%
  | "lossMid" // -25 to -50%
  | "lossHigh"; // beyond -50%

export type SoundEngine = {
  play: (name: SoundName) => void;
  /** Start the looped "analyzing" motif (idempotent). */
  startSearching: () => void;
  /** Stop the looped "analyzing" motif. */
  stopSearching: () => void;
  /** Resume/unlock the audio context. MUST be called synchronously inside a
   *  user gesture (Safari/iOS reject a resume that happens after an await). */
  resume: () => void;
};

/**
 * Dynamically load Tone.js and build the synth graph once. The audio context is
 * created here (suspended) but NOT resumed — call engine.resume() from inside a
 * user gesture to unlock it. Returns a small facade.
 */
export async function createSoundEngine(): Promise<SoundEngine | null> {
  let Tone: typeof ToneNS;
  try {
    Tone = await import("tone");
  } catch {
    return null;
  }

  // Master chain: gentle gain → softening low-pass → limiter → speakers.
  const master = new Tone.Gain(0.55);
  const softener = new Tone.Filter({ type: "lowpass", frequency: 7000, Q: 0.4 });
  const limiter = new Tone.Limiter(-6);
  master.connect(softener);
  softener.connect(limiter);
  limiter.toDestination();

  // Plucky, satisfying click for taps/navigation.
  const pluck = new Tone.PluckSynth({
    attackNoise: 0.8,
    dampening: 4500,
    resonance: 0.85,
  }).connect(master);
  pluck.volume.value = -9;

  // Clean triangle tone for melodic blips.
  const tone = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.08 },
  }).connect(master);
  tone.volume.value = -15;

  // Crisp square for toggles and the coin accent.
  const square = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.002, decay: 0.07, sustain: 0, release: 0.05 },
  }).connect(master);
  square.volume.value = -22;

  // Polyphonic synth so success chords ring together.
  const poly = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.22, sustain: 0.04, release: 0.25 },
  }).connect(master);
  poly.volume.value = -16;

  // Filtered noise for a smooth slide/whoosh. A gentle swell-and-fade envelope
  // plus a low-Q bandpass sweep reads as "sliding" rather than a harsh burst.
  const swipeFilter = new Tone.Filter({
    type: "bandpass",
    frequency: 1200,
    Q: 0.7,
  }).connect(master);
  const noise = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.03, decay: 0.22, sustain: 0, release: 0.05 },
  }).connect(swipeFilter);
  noise.volume.value = -8;

  // Soft sine that glides under the noise to give the slide a tonal body.
  const swipeTone = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0, release: 0.05 },
    portamento: 0.12,
  }).connect(master);
  swipeTone.volume.value = -14;

  // Sawtooth for the error buzz.
  const buzz = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.004, decay: 0.18, sustain: 0, release: 0.08 },
  }).connect(master);
  buzz.volume.value = -20;

  // Whisper-quiet sine for the graph-pulse tick and the analyzing loop.
  const soft = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.006, decay: 0.12, sustain: 0, release: 0.06 },
  }).connect(master);
  soft.volume.value = -15;

  // Looped "analyzing" motif (Tone.Loop on the transport).
  let searchLoop: ToneNS.Loop | null = null;
  const searchSeq = ["C5", "E5", "G5", "E5"];
  let searchIdx = 0;
  const startSearching = () => {
    if (searchLoop) return;
    searchIdx = 0;
    searchLoop = new Tone.Loop((time) => {
      soft.triggerAttackRelease(searchSeq[searchIdx % searchSeq.length], 0.09, time, 0.6);
      searchIdx += 1;
    }, "8n").start(0);
    Tone.getTransport().start();
  };
  const stopSearching = () => {
    if (!searchLoop) return;
    searchLoop.stop();
    searchLoop.dispose();
    searchLoop = null;
  };

  // Unlock the audio context. Calling the native resume() synchronously inside
  // a gesture is what Safari/iOS require; Tone.start() also flips Tone's flag.
  // Cheap no-op once the context is already running.
  const resume = () => {
    try {
      const raw = Tone.getContext().rawContext as unknown as AudioContext;
      if (!raw || raw.state === "running") return;
      void raw.resume();
      void Tone.start();
    } catch {
      /* ignore */
    }
  };

  const play = (name: SoundName) => {
    const t = Tone.now();
    try {
      switch (name) {
        case "tap":
          pluck.triggerAttack("C5", t);
          break;
        case "nav":
          tone.triggerAttackRelease("A4", 0.07, t);
          tone.triggerAttackRelease("E5", 0.1, t + 0.06);
          break;
        case "toggle":
          square.triggerAttackRelease("G4", 0.04, t);
          break;
        case "open":
          tone.triggerAttackRelease("C5", 0.06, t);
          tone.triggerAttackRelease("G5", 0.09, t + 0.055);
          break;
        case "close":
          tone.triggerAttackRelease("G5", 0.06, t);
          tone.triggerAttackRelease("C5", 0.09, t + 0.055);
          break;
        case "swipe":
          swipeFilter.frequency.cancelScheduledValues(t);
          swipeFilter.frequency.setValueAtTime(1900, t);
          swipeFilter.frequency.exponentialRampToValueAtTime(620, t + 0.2);
          noise.triggerAttackRelease(0.18, t);
          // A soft sine that glides down with it for a smooth, slidey body.
          swipeTone.frequency.setValueAtTime(660, t);
          swipeTone.triggerAttackRelease(330, 0.18, t, 0.5);
          break;
        case "send":
          tone.triggerAttackRelease("E5", 0.07, t);
          tone.triggerAttackRelease("B5", 0.09, t + 0.05);
          break;
        case "receive":
          tone.triggerAttackRelease("B5", 0.07, t);
          tone.triggerAttackRelease("G5", 0.11, t + 0.07);
          break;
        case "success":
          ["C5", "E5", "G5", "C6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.32, t + i * 0.08),
          );
          break;
        case "coin":
          square.triggerAttackRelease("B5", 0.05, t);
          square.triggerAttackRelease("E6", 0.12, t + 0.06);
          break;
        case "error":
          buzz.triggerAttackRelease("A2", 0.1, t);
          buzz.triggerAttackRelease("E2", 0.18, t + 0.09);
          break;
        case "pulse":
          soft.triggerAttackRelease("C6", 0.06, t, 0.55);
          break;
        case "enable":
          // Bright ascending "power on" chime (distinct from success).
          ["C5", "G5", "C6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.25, t + i * 0.07),
          );
          break;

        // Graded gains — brighter, higher and louder as the return grows.
        case "gainLow":
          ["C5", "G5"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.22, t + i * 0.08, 0.45),
          );
          break;
        case "gainMid":
          ["C5", "E5", "G5"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.26, t + i * 0.075, 0.72),
          );
          break;
        case "gainHigh":
          ["C5", "E5", "G5", "C6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.3, t + i * 0.07, 0.95),
          );
          // a little coin sparkle on top of a big winner
          square.triggerAttackRelease("E6", 0.12, t + 0.3, 0.6);
          break;

        // Graded losses — lower and louder as the drop deepens.
        case "lossLow":
          ["E4", "C4"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.24, t + i * 0.09, 0.45),
          );
          break;
        case "lossMid":
          ["E4", "C4", "A3"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.28, t + i * 0.09, 0.72),
          );
          break;
        case "lossHigh":
          ["E4", "C4", "F3"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.32, t + i * 0.09, 0.9),
          );
          buzz.triggerAttackRelease("F2", 0.22, t + 0.18, 0.7);
          break;
      }
    } catch {
      // best-effort; never throw into a UI handler
    }
  };

  return { play, startSearching, stopSearching, resume };
}
