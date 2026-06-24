import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VyVy WorkOS V2",
  description: "Nền tảng điều hành dự án mới đang được xây dựng.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
