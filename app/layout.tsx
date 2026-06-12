import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Oswald, EB_Garamond } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

// Display — thay thế HN Condensed Bold (brand book ch.05): tiếng hô, một lần mỗi màn
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
    <html lang="vi" className={`h-full antialiased ${jakarta.variable} ${oswald.variable} ${garamond.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
