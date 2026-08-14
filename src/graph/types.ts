export type NodeType = 'FILE' | 'CLASS' | 'FUNCTION' | 'METHOD' | 'INTERFACE' | 'VARIABLE';

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

export type EdgeType = 'CONTAINS' | 'IMPORTS' | 'CALLS' | 'REFERENCES' | 'EXTENDS' | 'IMPLEMENTS';

export interface Edge {
  from: string; // Source Node ID
  to: string; // Target Node ID
  relation: EdgeType;
}
