export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'go'
  | 'rust';

export type SymbolType =
  | 'file'
  | 'module'
  | 'reference'
  | 'class'
  | 'struct'
  | 'interface'
  | 'trait'
  | 'enum'
  | 'type'
  | 'function'
  | 'method'
  | 'constructor'
  | 'variable';

export interface ExtractedSymbol {
  id: string;
  type: SymbolType;
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  language?: SupportedLanguage;
  parameters?: string[];
  returnType?: string;
}

export interface ExtractedRelationship {
  fromId: string;
  toId: string;
  from: string;
  to: string;
  relation: 'CONTAINS' | 'IMPORTS' | 'CALLS' | 'REFERENCES';
}

export interface StandardizedOutput {
  files: string[];
  symbols: ExtractedSymbol[];
  relationships: ExtractedRelationship[];
}
