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
        <header className="page-head">
          <p className="kicker">设置</p>
          <h1>外观与评测</h1>
          <p className="lead">主题保存在本机。评测始终在服务器沙箱完成。</p>
        </header>
        <div className="stack">
          <section className="panel">
            <h2>外观</h2>
            <p className="ghost">浅色是默认。深色适合夜间做题。</p>
            <div className="choice-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className={theme === "light" ? "choice on" : "choice"}
                onClick={() => {
                  applyTheme("light");
                  setTheme("light");
                }}
              >
                浅色
                <small>默认训练站</small>
              </button>
              <button
                type="button"
                className={theme === "dark" ? "choice on" : "choice"}
                onClick={() => {
                  applyTheme("dark");
                  setTheme("dark");
                }}
              >
                深色
                <small>低亮度环境</small>
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>评测</h2>
            <p className="ghost">语言在做题页切换。浏览器不判题，判定结果来自沙箱。</p>
          </section>
        </div>
      </main>
    </Shell>
  );
}
