import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphNode, GraphData } from './types';

export class ContextExtractor {
  private repositoryRoot: string;
  private nodesById: Map<string, GraphNode>;

  constructor(repositoryRoot: string, graphData: GraphData) {
    this.repositoryRoot = repositoryRoot;
    this.nodesById = new Map();
    for (const node of graphData.nodes) {
      this.nodesById.set(node.id, node);
    }
  }

  /**
   * Extracts the exact source code for a given node based on its location mapping.
   */
  public extractCodeForNode(node: GraphNode): string {
    if (!node.filePath || node.startLine === undefined || node.endLine === undefined) {
      throw new Error(`Node ${node.id} is missing location data.`);
    }

    // For file nodes that may have line 0 to 0, just return the whole file
    if (node.type === 'FILE' && node.startLine === 0 && node.endLine === 0) {
      const absolutePath = path.join(this.repositoryRoot, node.filePath);
      return fs.readFileSync(absolutePath, 'utf8');
    }
    
    const absolutePath = path.join(this.repositoryRoot, node.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    const lines = fileContent.split(/\r?\n/);
    
    // Lines are 1-indexed in GraphNode
    const startIdx = Math.max(0, node.startLine - 1);
    const endIdx = Math.min(lines.length, node.endLine);

    return lines.slice(startIdx, endIdx).join('\n');
  }

  /**
   * Finds a node by ID and extracts its exact source code.
   */
  public extractCodeById(nodeId: string): string {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found in graph.`);
    }
    return this.extractCodeForNode(node);
  }
}
