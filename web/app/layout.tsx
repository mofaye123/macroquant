import type { Metadata } from "next";
import { ReactNode } from "react";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "MacroQuant",
  description: "MacroQuant dashboard rebuilt with Next.js + Tailwind for Cloudflare"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  );
}
