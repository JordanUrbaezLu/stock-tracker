/**
 * Brand-colored celebratory confetti. No-ops on the server. `onBurst` (if given)
 * fires the instant the confetti actually appears — pass the paired celebration
 * sound here so it stays in sync with the (intentionally delayed) confetti
 * rather than playing ~300ms early.
 */
export async function celebrate(onBurst?: () => void) {
  if (typeof window === "undefined") return;
  // Hold off ~300ms so the page can finish its initial render/animations first —
  // firing immediately competed for CPU and caused noticeable lag on the home
  // screen.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const confetti = (await import("canvas-confetti")).default;
  // Lighter burst on touch devices (phones/tablets), where the per-particle
  // loop is the most expensive thing on the main thread.
  const lite =
    window.matchMedia?.("(any-pointer: coarse)").matches ?? false;
  const colors = ["#22d3ee", "#a855f7", "#34d399", "#fbbf24", "#f472b6"];
  const common = {
    spread: 75,
    startVelocity: 42,
    ticks: lite ? 130 : 220,
    gravity: 1.05,
    scalar: 0.95,
    colors,
    disableForReducedMotion: true,
  };
  const side = lite ? 45 : 90;
  onBurst?.(); // play any paired sound exactly when the confetti appears
  // Two angled bursts from the lower corners toward the center.
  confetti({ ...common, particleCount: side, angle: 60, origin: { x: 0.1, y: 0.95 } });
  confetti({ ...common, particleCount: side, angle: 120, origin: { x: 0.9, y: 0.95 } });
  setTimeout(() => {
    confetti({
      ...common,
      particleCount: lite ? 24 : 50,
      angle: 90,
      origin: { x: 0.5, y: 1 },
    });
  }, 180);
}
