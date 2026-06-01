/** Up to two initials from a name, e.g. "Jordan Urbaez" → "JU". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-cyan-400 to-blue-500",
  "from-violet-400 to-fuchsia-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-indigo-500",
  "from-lime-400 to-emerald-500",
  "from-fuchsia-400 to-purple-500",
];

// Explicit colors for known investors (matched by first name). Everyone else
// gets a stable hashed gradient below.
const NAME_OVERRIDES: Record<string, string> = {
  alexa: "from-rose-400 to-pink-500", // pink
  lucas: "from-emerald-400 to-teal-500", // green
  brandon: "from-sky-400 to-blue-500", // blue
  jordan: "from-red-500 to-rose-600", // red
  aj: "from-orange-400 to-orange-600", // orange
};

/** Stable gradient identity for a name, so each investor keeps a consistent
 *  color across the home card, leaderboard, and their detail page. */
export function avatarGradient(name: string) {
  const first = name.trim().toLowerCase().split(/\s+/)[0];
  if (NAME_OVERRIDES[first]) return NAME_OVERRIDES[first];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
