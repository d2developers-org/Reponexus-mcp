import { GraphData, GraphNode } from './types';
import { ContextExtractor } from './ContextExtractor';

export interface MinimalContext {
  symbols: string[];
  code: string;
}

export class MinimalContextGenerator {
  private extractor: ContextExtractor;
  private nodesById: Map<string, GraphNode>;

  constructor(repositoryRoot: string, graphData: GraphData) {
    this.extractor = new ContextExtractor(repositoryRoot, graphData);
    this.nodesById = new Map();
    for (const node of graphData.nodes) {
      this.nodesById.set(node.id, node);
    }
  }

  /**
   * Generates a minimal context JSON package for LLM consumption.
   * @param nodeIds List of node IDs to include in the context
   */
  public generate(nodeIds: string[]): MinimalContext {
    // Remove duplicates
    const uniqueIds = Array.from(new Set(nodeIds));
    
    const symbolNames: string[] = [];
    const codeBlocks: string[] = [];

    for (const id of uniqueIds) {
      const node = this.nodesById.get(id);
      if (!node) continue;

      if (node.name) {
        symbolNames.push(node.name);
      }

      try {
        const code = this.extractor.extractCodeForNode(node);
        codeBlocks.push(`// --- ${node.name} (${node.filePath}) ---\n${code}`);
      } catch (e) {
        console.warn(`Warning: Could not extract code for ${node.id}`);
      }
    }

    return {
      symbols: symbolNames,
      code: codeBlocks.join('\n\n')
    };
  }
}
