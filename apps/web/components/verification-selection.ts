type IssueNodes = { witness_path?: string[]; minimized_nodes?: string[]; affected_nodes?: string[] };

export function matchingIssueNodes(issue: IssueNodes, nodes: { id: string }[]): string[] {
  const available = new Set(nodes.map((node) => node.id));
  const requested = [...(issue.witness_path || []), ...(issue.minimized_nodes || []), ...(issue.affected_nodes || [])];
  return [...new Set(requested.filter((id) => available.has(id)))];
}
