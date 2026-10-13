import "./spark.css";

export type ChartLegendItem = {
  label: string;
  /** Solid for real series, dashed for benchmarks and projections. */
  kind: "line" | "dashed";
  tone: "gain" | "loss" | "muted" | "amber";
};

export type ChartLegendProps = {
  items: ChartLegendItem[];
  className?: string;
};

/**
 * Key for the series in the chart below it: a short line swatch per series
 * (colored by its token) beside a muted label — sentence case in the hall,
 * the board's mono caps on the board (spark.css). Labels stay in text
 * color — the swatch alone carries identity.
 */
export function ChartLegend({ items, className }: ChartLegendProps) {
  return (
    <ul
      role="list"
      className={className ? `chart-legend ${className}` : "chart-legend"}
    >
      {items.map((item) => (
        <li key={`${item.label}:${item.kind}:${item.tone}`} className="chart-legend__item">
          <span
            aria-hidden
            className="chart-legend__key"
            data-kind={item.kind}
            data-tone={item.tone}
          />
          <span className="chart-legend__label">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
