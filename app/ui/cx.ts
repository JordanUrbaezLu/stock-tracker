/**
 * Joins class names, skipping falsy entries. There is no merging: a later
 * utility does not reliably override an earlier one on the same property, so
 * steer components through their props rather than conflicting classes.
 * Plain module (no "use client"), so server and client components share it.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
