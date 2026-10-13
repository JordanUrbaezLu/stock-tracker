import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import { AdminProvider } from "./AdminContext";
import { SoundProvider } from "./SoundContext";

// The whole UI voice: Archivo's width axis gives one family two registers —
// extra-condensed heavy numerals for the board, normal width for reading.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// Data labels only (dates, eyebrows, tape symbols, axis labels).
const martianMono = Martian_Mono({
  variable: "--font-martian",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// viewport-fit=cover lets the app draw edge-to-edge under the notch/home
// indicator (required for env(safe-area-inset-*) to be non-zero on iOS). The
// brand bar is always the dark board color, so the black-translucent status
// bar's white text stays legible over the light hall.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141219",
};

export const metadata: Metadata = {
  title: "Stock Tracker",
  description:
    "The family stock club — live portfolios, standings, and a daily check-in.",
  appleWebApp: {
    capable: true,
    title: "Stock Tracker",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${martianMono.variable} font-sans antialiased`}
      >
        <AdminProvider>
          <SoundProvider>{children}</SoundProvider>
        </AdminProvider>
      </body>
    </html>
  );
}
