import { Fragment } from "react";

/**
 * Renders a string with **double-asterisk** segments as bold. The AI insight
 * (/api/insight) is asked to bold the investor's name and tickers this way; we
 * keep the color inherited so bold reads naturally in any banner tone.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\*\*([^*]+)\*\*$/.exec(part);
        return match ? (
          <strong key={i} className="font-semibold text-white">
            {match[1]}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}
