import type { ReactNode } from "react";

function tidyMath(line: string) {
  return line
    .replace(/\$/g, "")
    .replace(/\\le/g, "≤")
    .replace(/\\ge/g, "≥")
    .replace(/\\times/g, "×")
    .replace(/\\,/g, " ");
}

function renderMarkdown(source: string) {
  const blocks = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let buffer: string[] = [];
  let inCode = false;
  let key = 0;

  const flushText = () => {
    if (!buffer.length) return;
    const text = buffer.join("\n");
    buffer = [];
    text.split("\n\n").forEach((para) => {
      const line = para.trim();
      if (!line) return;
      if (line.startsWith("# ")) {
        nodes.push(<h1 key={key++}>{line.slice(2)}</h1>);
      } else if (line.startsWith("## ")) {
        nodes.push(<h2 key={key++}>{line.slice(3)}</h2>);
      } else {
        nodes.push(<p key={key++}>{tidyMath(line)}</p>);
      }
    });
  };

  for (const line of blocks) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        nodes.push(<pre key={key++}>{buffer.join("\n")}</pre>);
        buffer = [];
        inCode = false;
      } else {
        flushText();
        inCode = true;
      }
      continue;
    }
    buffer.push(line);
  }
  if (inCode) {
    nodes.push(<pre key={key++}>{buffer.join("\n")}</pre>);
  } else {
    flushText();
  }
  return nodes;
}

export default function Statement({ source }: { source: string }) {
  return <div>{renderMarkdown(source)}</div>;
}
