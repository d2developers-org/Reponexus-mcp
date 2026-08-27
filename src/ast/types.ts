export interface ExtractedSymbol {
  type: 'class' | 'method' | 'function' | 'interface';
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  parameters?: string[];
  returnType?: string;
}

export interface ExtractedRelationship {
  from: string;
  to: string;
  relation: 'CONTAINS' | 'IMPORTS' | 'CALLS' | 'REFERENCES';
}

export interface StandardizedOutput {
  files: string[];
  symbols: ExtractedSymbol[];
  relationships: ExtractedRelationship[];
}
