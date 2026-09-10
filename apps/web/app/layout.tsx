import type { Metadata } from "next";
import { IBM_Plex_Sans_Condensed, JetBrains_Mono, Literata } from "next/font/google";
import "./globals.css";

const serif = Literata({
  subsets: ["latin"],
  variable: "--font-serif",
});

const ui = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "验流 Veriflow",
  description: "可验证算法训练平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${serif.variable} ${ui.variable} ${mono.variable}`}>
        <div className="grain" />
        {children}
      </body>
    </html>
  );
}
