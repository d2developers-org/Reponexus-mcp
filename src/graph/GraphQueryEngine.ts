import { InMemoryGraph } from './InMemoryGraph';
import { Node, EdgeType } from './types';

export type ExpandedContext = {
  depth: number;
  nodes: Node[];
};

export class GraphQueryEngine {
  private graph: InMemoryGraph;

  constructor(graph: InMemoryGraph) {
    this.graph = graph;
  }

  /**
   * Performs a depth-based context expansion starting from a specific node.
   * @param startNodeId The ID of the node to start the expansion from.
   * @param maxDepth The maximum depth to traverse.
   * @returns An array of objects grouping related nodes by their depth.
   */
  public getContextExpansion(startNodeId: string, maxDepth: number): ExpandedContext[] {
    const startNode = this.graph.getNode(startNodeId);
    if (!startNode) return [];

    const result: ExpandedContext[] = [];
    const visited = new Set<string>();
    
    // Depth 0 is just the start node
    result.push({ depth: 0, nodes: [startNode] });
    visited.add(startNodeId);

    let currentQueue = [startNodeId];

    for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
      const nextQueue: string[] = [];
      const currentDepthNodes: Node[] = [];

      for (const nodeId of currentQueue) {
        // Find all outgoing edges to find dependencies
        const outgoingEdges = this.graph.getEdgesFrom(nodeId);
        
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            nextQueue.push(edge.to);
            
            const targetNode = this.graph.getNode(edge.to);
            if (targetNode) {
              currentDepthNodes.push(targetNode);
            }
          }
        }
      }

      if (currentDepthNodes.length > 0) {
        result.push({ depth: currentDepth, nodes: currentDepthNodes });
      }

      if (nextQueue.length === 0) {
        // Stop early if there are no more nodes to explore
        break;
      }

      currentQueue = nextQueue;
    }

    return result;
  }

  /**
   * Searches for all nodes matching the given name.
   */
  public findNode(name: string): Node[] {
    return this.graph.getAllNodes().filter((node) => node.name === name);
  }

  /**
   * Retrieves nodes contained within a given node (relation: CONTAINS).
   */
  public getChildren(id: string): Node[] {
    const outEdges = this.graph.getEdgesFrom(id);
    const childrenIds = outEdges
      .filter((edge) => edge.relation === 'CONTAINS')
      .map((edge) => edge.to);

    return childrenIds
      .map((childId) => this.graph.getNode(childId))
      .filter((node): node is Node => node !== undefined);
  }

  /**
   * Retrieves nodes that call a given function/method (relation: CALLS).
   */
  public getCallers(id: string): Node[] {
    const inEdges = this.graph.getEdgesTo(id);
    const callerIds = inEdges
      .filter((edge) => edge.relation === 'CALLS')
      .map((edge) => edge.from);

    return callerIds
      .map((callerId) => this.graph.getNode(callerId))
      .filter((node): node is Node => node !== undefined);
  }

  /**
   * Retrieves functions/methods called by a given node (relation: CALLS).
   */
  public getCallees(id: string): Node[] {
    const outEdges = this.graph.getEdgesFrom(id);
    const calleeIds = outEdges
      .filter((edge) => edge.relation === 'CALLS')
      .map((edge) => edge.to);

    return calleeIds
      .map((calleeId) => this.graph.getNode(calleeId))
      .filter((node): node is Node => node !== undefined);
  }

  /**
   * Retrieves files or symbols imported by a given file (relation: IMPORTS).
   */
  public getImports(fileId: string): Node[] {
    const outEdges = this.graph.getEdgesFrom(fileId);
    const importedIds = outEdges
      .filter((edge) => edge.relation === 'IMPORTS')
      .map((edge) => edge.to);

    return importedIds
      .map((importedId) => this.graph.getNode(importedId))
      .filter((node): node is Node => node !== undefined);
  }

  /**
   * Retrieves nodes that reference a given symbol (relation: REFERENCES).
   */
  public getReferences(id: string): Node[] {
    const inEdges = this.graph.getEdgesTo(id);
    const referenceIds = inEdges
      .filter((edge) => edge.relation === 'REFERENCES')
      .map((edge) => edge.from);

    return referenceIds
      .map((referenceId) => this.graph.getNode(referenceId))
      .filter((node): node is Node => node !== undefined);
  }
}
