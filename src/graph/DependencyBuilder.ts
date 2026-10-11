import { GraphData, GraphNode, GraphEdge } from './types';

export interface DependencyContext {
  imports: GraphNode[];
  references: GraphNode[];
  related: GraphNode[];
}

export class DependencyBuilder {
  private nodesById: Map<string, GraphNode>;
  private edgesBySource: Map<string, GraphEdge[]>;

  constructor(graphData: GraphData) {
    this.nodesById = new Map();
    for (const node of graphData.nodes) {
      this.nodesById.set(node.id, node);
    }

    this.edgesBySource = new Map();
    for (const edge of graphData.edges) {
      if (!this.edgesBySource.has(edge.sourceId)) {
        this.edgesBySource.set(edge.sourceId, []);
      }
      this.edgesBySource.get(edge.sourceId)!.push(edge);
    }
  }

  /**
   * Given a target symbol ID, collects its direct dependencies from the graph.
   */
  public buildContext(targetId: string): DependencyContext {
    const context: DependencyContext = {
      imports: [],
      references: [],
      related: []
    };

    const targetNode = this.nodesById.get(targetId);
    if (!targetNode) {
      throw new Error(`Node with ID ${targetId} not found.`);
    }

    // 1. Gather Imports from the symbol's host file
    const fileId = `file:${targetNode.filePath}`;
    const fileEdges = this.edgesBySource.get(fileId) || [];
    for (const edge of fileEdges) {
      if (edge.relation === 'IMPORTS') {
        const importNode = this.nodesById.get(edge.targetId);
        if (importNode) {
          context.imports.push(importNode);
        }
      }
    }

    // 2. Find outgoing edges from the specific target symbol
    const targetEdges = this.edgesBySource.get(targetId) || [];
    for (const edge of targetEdges) {
      const target = this.nodesById.get(edge.targetId);
      if (!target) continue;

      if (edge.relation === 'CALLS') {
        // Collect referenced symbols/functions called
        context.references.push(target);
      } else if (edge.relation === 'CONTAINS') {
        // Collect related inner nodes (e.g. classes containing methods)
        context.related.push(target);
      }
    }

    return context;
  }
}
