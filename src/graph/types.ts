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

export type QueryIntentType = 'modify' | 'create' | 'fix' | 'refactor' | 'explain';

export interface QueryOperation {
  action: string;
  target?: string;
  replacement?: string;
}

export interface MatchedSymbol {
  nodeId: string;
  name: string;
  type: string;
  filePath: string;
  confidence: number;
  matchType: 'exact' | 'case-insensitive' | 'fuzzy' | 'file';
}

export interface QueryAnalysisResult {
  query: string;
  intent: QueryIntentType;
  operations: QueryOperation[];
  extractedKeywords: string[];
  targetSymbols: MatchedSymbol[];
}
