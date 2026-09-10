"use client";

import Editor from "@monaco-editor/react";

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
  return (
    <Editor
      height={height}
      language={language === "python" ? "python" : "cpp"}
      theme="vs-dark"
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
      }}
      onMount={(_editor, monaco) => {
        monaco.editor.setTheme("veriflow-night");
      }}
    />
  );
}
