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
  | "type" // soft key tick as the assistant types its answer
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
  /** Slide "fwip" whose pitch climbs with the slide index (directional feel). */
  swipe: (index: number) => void;
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

  // Tighten the scheduling look-ahead so tap/swipe feedback fires close to the
  // gesture instead of ~100ms later (Tone's default lookAhead is 0.1s, which
  // reads as laggy for one-shot UI sounds). 0.02s stays comfortably above the
  // audio quantum while feeling immediate; the (soft, infrequent) search loop
  // tolerates the tighter window fine.
  try {
    Tone.getContext().lookAhead = 0.02;
  } catch {
    /* older Tone / unusual context — keep the default */
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

  // Resonant lowpass + sawtooth for the smooth "shwoop" slide: sweeping the
  // cutoff over a pitch-gliding saw gives that gliding, friction-y slide feel.
  const slideFilter = new Tone.Filter({
    type: "lowpass",
    frequency: 500,
    Q: 4,
  }).connect(master);
  const slideSynth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.035, decay: 0.26, sustain: 0, release: 0.07 },
    portamento: 0.16,
  }).connect(slideFilter);
  slideSynth.volume.value = -16;

  // Sawtooth for the error buzz.
  const buzz = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.004, decay: 0.18, sustain: 0, release: 0.08 },
  }).connect(master);
  buzz.volume.value = -20;

  // Whisper-quiet sine for the graph-pulse tick and the typing tick — these
  // fire at Tone.now() (monotonic), so they never schedule out of order.
  const soft = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.006, decay: 0.12, sustain: 0, release: 0.06 },
  }).connect(master);
  soft.volume.value = -15;

  // The analyzing loop gets its OWN synth: it schedules at future transport
  // times, which must never share a synth with the now()-based ticks above
  // (mixing the two produces out-of-order times → Tone throws).
  const loopSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.006, decay: 0.12, sustain: 0, release: 0.06 },
  }).connect(master);
  loopSynth.volume.value = -15;

  // Looped "analyzing" motif (Tone.Loop on the transport).
  let searchLoop: ToneNS.Loop | null = null;
  const searchSeq = ["C5", "E5", "G5", "E5"];
  let searchIdx = 0;
  const startSearching = () => {
    if (searchLoop) return;
    searchIdx = 0;
    searchLoop = new Tone.Loop((time) => {
      try {
        loopSynth.triggerAttackRelease(
          searchSeq[searchIdx % searchSeq.length],
          0.09,
          time,
          0.6,
        );
        searchIdx += 1;
      } catch {
        /* ignore stray scheduling hiccups */
      }
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

  // The slide "fwip", with a pop note that climbs a pentatonic scale by the
  // given step — the caller raises the step on consecutive forward swipes and
  // lowers it on back swipes, so swiping keeps ascending/descending the scale.
  // The shimmer rides two steps above.
  const swipeScale = [
    "C6",
    "D6",
    "E6",
    "G6",
    "A6",
    "C7",
    "D7",
    "E7",
    "G7",
    "A7",
  ];
  const fwip = (step: number) => {
    const t = Tone.now();
    try {
      const i = Math.max(0, Math.min(swipeScale.length - 1, Math.round(step)));
      const pop = swipeScale[i];
      const shimmer = swipeScale[Math.min(i + 2, swipeScale.length - 1)];
      swipeFilter.frequency.cancelScheduledValues(t);
      swipeFilter.frequency.setValueAtTime(2800, t);
      swipeFilter.frequency.exponentialRampToValueAtTime(640, t + 0.15);
      noise.triggerAttackRelease(0.13, t);
      swipeTone.frequency.setValueAtTime(440, t);
      swipeTone.triggerAttackRelease(560 + i * 60, 0.14, t, 0.45); // glide lifts with index
      // Land the pluck "pop" (the prominent part of the swipe) almost on the
      // gesture instead of ~85ms later, so the slide sound feels instant.
      pluck.triggerAttack(pop, t + 0.015);
      soft.triggerAttackRelease(shimmer, 0.07, t + 0.05, 0.28);
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
          fwip(2); // default mid-scale fwip (callers use swipe(index) for pitch)
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
        case "type":
          soft.triggerAttackRelease("G5", 0.025, t, 0.36);
          break;
        case "enable":
          // Bright ascending "power on" chime (distinct from success).
          ["C5", "G5", "C6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.25, t + i * 0.07),
          );
          break;

        // Graded gains — brighter, higher and louder as the return grows.
        case "gainLow":
          // Energetic full major arpeggio (was the mid tier).
          ["C5", "E5", "G5", "C6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.28, t + i * 0.07, 0.85),
          );
          square.triggerAttackRelease("E6", 0.1, t + 0.28, 0.5);
          break;
        case "gainMid":
          // Euphoric rising run topped with bright sparkles (was the high tier).
          ["C5", "E5", "G5", "C6", "E6", "G6"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.32, t + i * 0.06, 1),
          );
          square.triggerAttackRelease("C7", 0.18, t + 0.42, 0.6);
          square.triggerAttackRelease("E6", 0.1, t + 0.06, 0.5);
          break;
        case "gainHigh": {
          // Grand triumphant fanfare — a rising run across octaves, a ringing
          // high chord at the peak, and climbing sparkles. The biggest winners.
          ["C5", "E5", "G5", "C6", "E6", "G6", "C7"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.5, t + i * 0.06, 1),
          );
          ["C6", "E6", "G6"].forEach((n) =>
            poly.triggerAttackRelease(n, 0.8, t + 0.45, 0.9),
          );
          square.triggerAttackRelease("E6", 0.1, t + 0.06, 0.5);
          square.triggerAttackRelease("C7", 0.16, t + 0.45, 0.55);
          square.triggerAttackRelease("E7", 0.2, t + 0.55, 0.45);
          break;
        }

        // Graded losses — lower and louder as the drop deepens.
        case "lossLow":
          // A steeper minor descent with a low buzz under it (was the mid tier).
          ["E4", "C4", "A3", "F3"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.3, t + i * 0.1, 0.82),
          );
          buzz.triggerAttackRelease("C3", 0.2, t + 0.3, 0.55);
          break;
        case "lossMid":
          // Sad-trombone descent — minor fall + a "womp womp womp wahhh"
          // sawtooth slide (was the high tier).
          ["E4", "C4", "A3", "F3"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.45, t + i * 0.13, 0.95),
          );
          ["C3", "Bb2", "A2", "F2"].forEach((n, i) =>
            buzz.triggerAttackRelease(n, i === 3 ? 0.6 : 0.18, t + 0.1 + i * 0.16, 0.85),
          );
          break;
        case "lossHigh":
          // Total devastation — a slow, deep collapse with a long sad-trombone
          // slide that bottoms out on a held low note. The worst losers.
          ["E4", "C4", "A3", "F3", "D3"].forEach((n, i) =>
            poly.triggerAttackRelease(n, 0.6, t + i * 0.16, 0.95),
          );
          ["C3", "Bb2", "A2", "F2"].forEach((n, i) =>
            buzz.triggerAttackRelease(n, 0.22, t + 0.12 + i * 0.2, 0.9),
          );
          buzz.triggerAttackRelease("D2", 1.1, t + 0.92, 0.9); // deep, long "wahhh"
          break;
      }
    } catch {
      // best-effort; never throw into a UI handler
    }
  };

  return { play, swipe: fwip, startSearching, stopSearching, resume };
}
