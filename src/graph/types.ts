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

// ─── SAGE v2 Multi-Resolution Graph & Pipeline Types ─────────────

export type NodeLevel = 'file' | 'symbol' | 'block';

export type BlockType =
  | 'TRY'
  | 'CATCH'
  | 'IF'
  | 'ELSE'
  | 'LOOP'
  | 'SWITCH_CASE'
  | 'BLOCK';

export interface GraphNodeAnnotation {
  identifiers: string[];
  errorPatterns: string[];
  behaviorTags: string[];
  keywords: string[];
}

export interface SAGENode extends GraphNode {
  level: NodeLevel;
  blockType?: BlockType;
  parentId?: string;
  annotation: GraphNodeAnnotation;
}

export type EnrichedEdgeRelation =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'CALLS'
  | 'CALLED_BY'
  | 'EXPORTS'
  | 'THROWS'
  | 'CATCHES'
  | 'IMPLEMENTS';

export interface SAGEGraph {
  nodes: SAGENode[];
  edges: GraphEdge[];
}

// ─── Signals & Target Resolution ────────────────────────────────

export type SignalSource = 'workspace' | 'query' | 'error' | 'diff' | 'session';

export interface Activation {
  nodeId: string;
  score: number; // 0.0 - 1.0
  source: SignalSource;
  reason: string;
}

export interface QueryInput {
  query: string;
  activeFile?: string;
  cursorLine?: number;
  openFiles?: string[];
  errors?: string;
  diff?: string;
  sessionHistory?: string[];
}

export interface TargetCandidate {
  nodeId: string;
  name: string;
  type: string;
  filePath: string;
  startLine: number;
  endLine: number;
  confidence: number;
  matchPriority: number; // P1 - P8
  reasons: string[];
}

export interface TargetResolution {
  targets: TargetCandidate[];
  status: 'resolved' | 'ambiguous' | 'insufficient_evidence';
}

// ─── Line Resolution & Context Plan ─────────────────────────────

export type RetrievalStatus = 'matched' | 'ambiguous' | 'insufficient_evidence';

export type QueryAction =
  | 'fix'
  | 'create'
  | 'modify'
  | 'refactor'
  | 'explain'
  | 'unknown';

export interface ResolvedRegion {
  filePath: string;
  startLine: number;
  endLine: number;
  nodeId: string;
  activationScore: number;
  reasons: string[];
  pinnedBy: SignalSource[];
}

export interface ContextPlan {
  query: string;
  action: {
    type: QueryAction;
    confidence: number;
  };
  target: TargetCandidate | null;
  regions: ResolvedRegion[];
  code: string;
  dependencies: Array<{
    source: string;
    target: string;
    relation: string;
  }>;
  status: RetrievalStatus;
  truncated: boolean;
  signalSummary: Record<SignalSource, number>;
}

