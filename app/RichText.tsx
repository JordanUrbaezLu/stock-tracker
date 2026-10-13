import { Fragment } from "react";
import "./ui/primitives.css";

/**
 * Renders a string with **double-asterisk** segments as bold. The AI insight
 * (/api/insight) is asked to bold the investor's name and tickers this way.
 * Bold steps up to full ink (size inherited) with a highlighter-pen swipe
 * behind it, so names jump out of muted copy in the hall, on the board and
 * on jerseys alike.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\*\*([^*]+)\*\*$/.exec(part);
        return match ? (
          <strong key={i} className="ui-marker font-bold text-ink">
            {match[1]}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}
