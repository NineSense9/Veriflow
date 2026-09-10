"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  return (
    <Shell>
      <main className="page">
        <div className="kicker">Settings</div>
        <h1>设置</h1>
        <section className="card">
          <h2>外观</h2>
          <p className="ghost">浅色是默认训练站。夜间保留原来的做题桌。</p>
          <div className="filters">
            <button
              type="button"
              className={theme === "light" ? "on" : ""}
              onClick={() => {
                applyTheme("light");
                setTheme("light");
              }}
            >
              白天
            </button>
            <button
              type="button"
              className={theme === "dark" ? "on" : ""}
              onClick={() => {
                applyTheme("dark");
                setTheme("dark");
              }}
            >
              夜间
            </button>
          </div>
        </section>
        <section className="card" style={{ marginTop: 16 }}>
          <h2>评测</h2>
          <p className="ghost">语言在做题页切换。判定在服务器沙箱完成，浏览器不判题。</p>
        </section>
      </main>
    </Shell>
  );
}
