import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Literata } from "next/font/google";
import "./globals.css";

const serif = Literata({
  subsets: ["latin"],
  variable: "--font-serif",
});

const ui = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "VeriFlow",
    template: "%s · VeriFlow",
  },
  applicationName: "VeriFlow",
  description: "Specification-guided verification for LLM-generated workflows. AI proposes. VeriFlow proves.",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('vf_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${serif.variable} ${ui.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
