"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { readTheme } from "@/lib/theme";

export default function CodeEditor({
  language,
  value,
  onChange,
  height = "100%",
}: {
  language: "python" | "cpp";
  value: string;
  onChange: (value: string) => void;
  height?: string;
}) {
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  function apply(monaco: Parameters<OnMount>[1]) {
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
    <Editor
      height={height}
      language={language === "python" ? "python" : "cpp"}
      theme={readTheme() === "dark" ? "veriflow-night" : "veriflow-day"}
      loading={<div className="editor-loading">装卷</div>}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      options={{
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12 },
        renderLineHighlight: "line",
        smoothScrolling: true,
      }}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme("veriflow-night", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#0e0f0c",
            "editor.foreground": "#d7d3c4",
            "editorLineNumber.foreground": "#6d675c",
            "editor.selectionBackground": "#3a3428",
            "editorCursor.foreground": "#c4a574",
            "editor.lineHighlightBackground": "#16170f",
          },
        });
        monaco.editor.defineTheme("veriflow-day", {
          base: "vs",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#fbf8f1",
            "editor.foreground": "#1c1915",
            "editorLineNumber.foreground": "#8a8478",
            "editor.selectionBackground": "#e6dcc4",
            "editorCursor.foreground": "#8a6230",
            "editor.lineHighlightBackground": "#f3ece0",
          },
        });
      }}
      onMount={(_editor, monaco) => {
        monacoRef.current = monaco;
        apply(monaco);
      }}
    />
  );
}
