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
          <h1>设置</h1>
          <p className="lead">主题保存在本机。评测始终在服务器沙箱完成。</p>
        </header>
        <div className="setting-list">
          <div className="setting-row">
            <div>
              <h2>外观</h2>
              <p className="ghost">浅色是默认。深色适合夜间做题。</p>
            </div>
            <div className="seg" role="group" aria-label="外观">
              <button
                type="button"
                className={theme === "light" ? "on" : ""}
                aria-pressed={theme === "light"}
                onClick={() => {
                  applyTheme("light");
                  setTheme("light");
                }}
              >
                浅色
              </button>
              <button
                type="button"
                className={theme === "dark" ? "on" : ""}
                aria-pressed={theme === "dark"}
                onClick={() => {
                  applyTheme("dark");
                  setTheme("dark");
                }}
              >
                深色
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h2>评测</h2>
              <p className="ghost">语言在做题页切换。浏览器不判题，判定结果来自沙箱。</p>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
