type IssueNodes = { witness_path?: string[]; minimized_nodes?: string[]; affected_nodes?: string[] };

export function matchingIssueNodes(issue: IssueNodes, nodes: { id: string; tool?: string | null }[]): string[] {
  const available = new Set(nodes.map((node) => node.id));
  const requested = [...(issue.witness_path || []), ...(issue.minimized_nodes || []), ...(issue.affected_nodes || [])];
  return [...new Set(requested.flatMap((id) => available.has(id) ? [id] : nodes.filter((node) => node.tool === id).map((node) => node.id)))];
}
