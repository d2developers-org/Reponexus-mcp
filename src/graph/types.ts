export interface GraphNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
