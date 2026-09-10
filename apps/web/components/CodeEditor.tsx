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
      loading={<div className="editor-loading">加载编辑器…</div>}
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
            "editor.background": "#12141a",
            "editor.foreground": "#eceef1",
            "editorLineNumber.foreground": "#6b7280",
            "editor.selectionBackground": "#134e4a",
            "editorCursor.foreground": "#2dd4bf",
            "editor.lineHighlightBackground": "#1c1f26",
          },
        });
        monaco.editor.defineTheme("veriflow-day", {
          base: "vs",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#fafafa",
            "editor.foreground": "#111827",
            "editorLineNumber.foreground": "#8b929c",
            "editor.selectionBackground": "#ccfbf1",
            "editorCursor.foreground": "#0f766e",
            "editor.lineHighlightBackground": "#f3f4f6",
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
