import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Literata } from "next/font/google";
import Providers from "@/components/Providers";
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
            __html: `try{var t=localStorage.getItem('vf_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);var p=JSON.parse(localStorage.getItem('vf_prefs')||'{}');if(p.density)document.documentElement.dataset.density=p.density;var lvl=p.effectsLevel||(p.reducedMotion?'reduced':'full');document.documentElement.dataset.effects=lvl;document.documentElement.dataset.motion=(lvl==='full'||lvl==='balanced')?'full':'reduce';if(p.codeFontPx)document.documentElement.style.setProperty('--code-font-size',p.codeFontPx+'px');}catch(e){}`,
          }}
        />
      </head>
      <body className={`${serif.variable} ${ui.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
