import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stock Tracker",
    short_name: "Stocks",
    description:
      "The family stock club — live portfolios, standings, and a daily check-in.",
    start_url: "/",
    display: "standalone",
    // The board color (--board): splash screen and status bar match the
    // brand bar.
    background_color: "#141219",
    theme_color: "#141219",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
