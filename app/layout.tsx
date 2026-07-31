import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AdminProvider } from "./AdminContext";
import { SoundProvider } from "./SoundContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the hero numbers, headings, and brand — a confident,
// tabular-figured grotesk that gives the big financial values real presence.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// viewport-fit=cover lets the app draw edge-to-edge under the notch/home
// indicator (required for env(safe-area-inset-*) to be non-zero on iOS —
// pages pad with it so content clears the Dynamic Island and home bar).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05060f",
};

export const metadata: Metadata = {
  title: "Stock Tracker",
  description: "Look up live stock prices by ticker symbol.",
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
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <AdminProvider>
          <SoundProvider>{children}</SoundProvider>
        </AdminProvider>
      </body>
    </html>
  );
}
