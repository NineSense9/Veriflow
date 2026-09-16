export function statementProse(source: string): string {
  const match = source.match(/^## 样例(?:\s|$)/m);
  if (!match || match.index === undefined) return source;
  return source.slice(0, match.index).trimEnd();
}
