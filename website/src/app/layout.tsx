import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hyperclicker.app"),
  title: {
    default: "HyperClicker — batched input dispatch with honest numbers",
    template: "%s · HyperClicker",
  },
  description:
    "A high-precision click engine that batches input into single kernel calls, gates on a live Rhai rule, and reports the clicks the OS actually accepted — not the ones it claimed to send.",
  openGraph: {
    title: "HyperClicker",
    description:
      "Batched input dispatch with a hybrid sleep/spin timer and measured throughput.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}