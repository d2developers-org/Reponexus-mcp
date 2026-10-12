import {
  GraphData,
  GraphNode,
  QueryIntentType,
  QueryOperation,
  MatchedSymbol,
  QueryAnalysisResult
} from './types';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'please'
]);

export interface AnalyzeQueryOptions {
  query: string;
}

export class QueryAnalyzer {
  private graphData?: GraphData;
  private nodesByName: Map<string, GraphNode[]>;
  private nodesByLowerName: Map<string, GraphNode[]>;

  constructor(graphData?: GraphData) {
    this.graphData = graphData;
    this.nodesByName = new Map();
    this.nodesByLowerName = new Map();

    if (graphData) {
      this.indexNodes(graphData.nodes);
    }
  }

  private indexNodes(nodes: GraphNode[]): void {
    for (const node of nodes) {
      if (!node.name) continue;

      if (!this.nodesByName.has(node.name)) {
        this.nodesByName.set(node.name, []);
      }
      this.nodesByName.get(node.name)!.push(node);

      const lowerName = node.name.toLowerCase();
      if (!this.nodesByLowerName.has(lowerName)) {
        this.nodesByLowerName.set(lowerName, []);
      }
      this.nodesByLowerName.get(lowerName)!.push(node);
    }
  }

  /**
   * Main entry point: analyzes a natural language query and maps it to intents, operations, and repository symbols.
   */
  public analyzeQuery(options: AnalyzeQueryOptions): QueryAnalysisResult {
    const rawQuery = options.query.trim();
    const intent = this.detectIntent(rawQuery);
    const operations = this.extractOperations(rawQuery);
    const keywords = this.extractKeywords(rawQuery);
    const targetSymbols = this.matchSymbols(keywords, rawQuery);

    return {
      query: rawQuery,
      intent,
      operations,
      extractedKeywords: keywords,
      targetSymbols
    };
  }

  /**
   * Classify intent: modify, create, fix, refactor, or explain.
   */
  private detectIntent(query: string): QueryIntentType {
    const q = query.toLowerCase();

    // Intent patterns with priority
    if (/\b(fix|bug|broken|error|fail|crash|issue|patch|resolve|problem)\b/i.test(q)) {
      return 'fix';
    }
    if (/\b(refactor|clean|cleanup|simplify|decouple|reorganize|rename)\b/i.test(q)) {
      return 'refactor';
    }
    if (/\b(replace|swap|switch|change|modify|update|convert|migrate|edit)\b/i.test(q)) {
      return 'modify';
    }
    if (/\b(create|add|implement|new|generate|introduce|build|write)\b/i.test(q)) {
      return 'create';
    }
    if (/\b(explain|how|what|where|why|describe|inspect|find|locate|show)\b/i.test(q)) {
      return 'explain';
    }

    // Default fallback
    return 'modify';
  }

  /**
   * Extract semantic operations from common development phrasing.
   */
  private extractOperations(query: string): QueryOperation[] {
    const ops: QueryOperation[] = [];

    // Pattern 1: Replace X with/by Y
    const replaceMatch = query.match(/replace\s+([A-Za-z0-9_\-\.]+)\s+(?:with|by)\s+([A-Za-z0-9_\-\.]+)/i);
    if (replaceMatch) {
      ops.push({
        action: 'replace',
        target: replaceMatch[1],
        replacement: replaceMatch[2]
      });
    }

    // Pattern 2: Add/Create X in/to Y
    const addMatch = query.match(/(?:add|create|implement)\s+([A-Za-z0-9_\-\.]+)\s+(?:in|to|for)\s+([A-Za-z0-9_\-\.]+)/i);
    if (addMatch) {
      ops.push({
        action: 'add',
        target: addMatch[2],
        replacement: addMatch[1]
      });
    }

    // Pattern 3: Fix X in Y
    const fixMatch = query.match(/fix\s+(?:the\s+)?([A-Za-z0-9_\-\.]+)\s+(?:in|of)\s+([A-Za-z0-9_\-\.]+)/i);
    if (fixMatch) {
      ops.push({
        action: 'fix',
        target: fixMatch[2] || fixMatch[1]
      });
    }

    // Fallback: Generic operation
    if (ops.length === 0) {
      const firstWord = query.trim().split(/\s+/)[0]?.toLowerCase();
      ops.push({
        action: firstWord || 'inspect'
      });
    }

    return ops;
  }

  /**
   * Tokenize and extract candidate keywords/entities from the query.
   */
  private extractKeywords(query: string): string[] {
    // Match identifiers, file names, words, and camelCase tokens
    const tokens = query.match(/[A-Za-z0-9_\.\-\/]+/g) || [];
    const uniqueKeywords = new Set<string>();

    for (const token of tokens) {
      const clean = token.replace(/^[^\w]+|[^\w]+$/g, '');
      if (!clean) continue;

      const lower = clean.toLowerCase();
      // Keep if not a common stop word, or if it contains uppercase/dots/underscores
      const isCodeLike = /[A-Z]/.test(clean) || clean.includes('.') || clean.includes('_') || clean.includes('/');
      if (isCodeLike || (!STOP_WORDS.has(lower) && clean.length > 2)) {
        uniqueKeywords.add(clean);
      }
    }

    return Array.from(uniqueKeywords);
  }

  /**
   * Match extracted keywords and query phrases against repository graph symbols.
   */
  private matchSymbols(keywords: string[], fullQuery: string): MatchedSymbol[] {
    if (!this.graphData || !this.graphData.nodes) {
      return [];
    }

    const matchedMap = new Map<string, MatchedSymbol>();

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // 1. Exact match on symbol name
      const exactNodes = this.nodesByName.get(keyword) || [];
      for (const node of exactNodes) {
        this.addMatchedSymbol(matchedMap, node, 1.0, 'exact');
      }

      // 2. Case-insensitive match
      const caseNodes = this.nodesByLowerName.get(lowerKeyword) || [];
      for (const node of caseNodes) {
        this.addMatchedSymbol(matchedMap, node, 0.9, 'case-insensitive');
      }

      // 3. File path match (e.g. AuthService.ts, sample.ts, src/ast)
      for (const node of this.graphData.nodes) {
        if (node.filePath && (node.filePath.endsWith(keyword) || node.filePath.includes(keyword))) {
          const confidence = node.filePath.endsWith(keyword) ? 0.85 : 0.75;
          this.addMatchedSymbol(matchedMap, node, confidence, 'file');
        }
      }
    }

    // 4. Substring / partial match on symbol names for longer keywords
    for (const keyword of keywords) {
      if (keyword.length < 3) continue;
      const lowerKeyword = keyword.toLowerCase();

      for (const node of this.graphData.nodes) {
        if (!node.name) continue;
        const lowerNodeName = node.name.toLowerCase();

        if (lowerNodeName.includes(lowerKeyword) || lowerKeyword.includes(lowerNodeName)) {
          // Avoid lowering score if already matched with higher confidence
          this.addMatchedSymbol(matchedMap, node, 0.7, 'fuzzy');
        }
      }
    }

    // Sort by confidence descending, then by line count / importance
    return Array.from(matchedMap.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private addMatchedSymbol(
    map: Map<string, MatchedSymbol>,
    node: GraphNode,
    confidence: number,
    matchType: 'exact' | 'case-insensitive' | 'fuzzy' | 'file'
  ): void {
    const existing = map.get(node.id);
    if (!existing || existing.confidence < confidence) {
      map.set(node.id, {
        nodeId: node.id,
        name: node.name,
        type: node.type,
        filePath: node.filePath,
        confidence,
        matchType
      });
    }
  }
}
