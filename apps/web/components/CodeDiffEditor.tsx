"use client";

import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { readTheme } from "@/lib/theme";

export default function CodeDiffEditor({
  original,
  modified,
  language,
  height = "100%",
}: {
  original: string;
  modified: string;
  language: "python" | "cpp";
  height?: string;
}) {
  const monacoRef = useRef<Parameters<DiffOnMount>[1] | null>(null);

  function apply(monaco: Parameters<DiffOnMount>[1]) {
    const dark = readTheme() === "dark";
    monaco.editor.setTheme(dark ? "veriflow-night" : "veriflow-day");
  }

  useEffect(() => {
    const onTheme = () => {
      if (monacoRef.current) apply(monacoRef.current);
    };
    window.addEventListener("vf-theme", onTheme);
    return () => window.removeEventListener("vf-theme", onTheme);
  }, []);

  return (
    <DiffEditor
      height={height}
      original={original}
      modified={modified}
      language={language === "python" ? "python" : "cpp"}
      theme={readTheme() === "dark" ? "veriflow-night" : "veriflow-day"}
      loading={<div className="editor-loading">加载代码差异比对…</div>}
      options={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 13,
        minimap: { enabled: false },
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        smoothScrolling: true,
      }}
      onMount={(_, monaco) => {
        monacoRef.current = monaco;
        apply(monaco);
      }}
    />
  );
}
