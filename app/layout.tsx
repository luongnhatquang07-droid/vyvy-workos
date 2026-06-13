import type { Metadata } from "next";
import { Be_Vietnam_Pro, Oswald, EB_Garamond, Jost } from "next/font/google";
import "./globals.css";

// Body — Be Vietnam Pro (brand book ch.05): thân bài, luôn ≥14px
const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Labels / eyebrow / nav — Jost: sans mảnh UPPERCASE giãn chữ
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-label",
  display: "swap",
});

// Display — thay thế HN Condensed Bold: tiếng hô, một lần mỗi màn
const oswald = Oswald({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Serif — thay thế SFU GaramondThree: hồn, lead & trích dẫn, chỉ ≤26px
const garamond = EB_Garamond({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VyVy WorkOS",
  description: "COO Operating System for VyVyHaircare",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`h-full antialiased ${beVietnam.variable} ${oswald.variable} ${garamond.variable} ${jost.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
