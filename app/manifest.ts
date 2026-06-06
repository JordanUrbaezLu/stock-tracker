import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stock Tracker",
    short_name: "Stocks",
    description: "Look up live stock prices by ticker symbol.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060f",
    theme_color: "#05060f",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
