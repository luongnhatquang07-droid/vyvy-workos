import type { Metadata } from "next";
import { Inter, Oswald, EB_Garamond } from "next/font/google";
import "./globals.css";

// Body — thay thế HN Light/Text (brand book ch.05): thân bài, luôn ≥14px
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
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
    <html lang="vi" className={`h-full antialiased ${inter.variable} ${oswald.variable} ${garamond.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
