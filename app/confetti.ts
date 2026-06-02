/** Brand-colored celebratory confetti. No-ops on the server. */
export async function celebrate() {
  if (typeof window === "undefined") return;
  // Hold off ~300ms so the page can finish its initial render/animations first —
  // firing immediately competed for CPU and caused noticeable lag on the home
  // screen.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#22d3ee", "#a855f7", "#34d399", "#fbbf24", "#f472b6"];
  const common = {
    spread: 75,
    startVelocity: 42,
    ticks: 220,
    gravity: 1.05,
    scalar: 0.95,
    colors,
    disableForReducedMotion: true,
  } as const;
  // Two angled bursts from the lower corners toward the center.
  confetti({ ...common, particleCount: 90, angle: 60, origin: { x: 0.1, y: 0.95 } });
  confetti({ ...common, particleCount: 90, angle: 120, origin: { x: 0.9, y: 0.95 } });
  setTimeout(() => {
    confetti({ ...common, particleCount: 50, angle: 90, origin: { x: 0.5, y: 1 } });
  }, 180);
}
