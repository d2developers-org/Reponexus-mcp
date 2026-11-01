import { InMemoryGraph } from './InMemoryGraph';
import { Edge, EdgeType, Node } from './types';

export const DEFAULT_MAX_DEPTH = 3;

export type ExpandedContext = {
  depth: number;
  nodes: Node[];
};

export type TargetResolution = {
  query: string;
  status: 'matched' | 'ambiguous' | 'not-found';
  target?: Node;
  candidates: Node[];
};

export type AdaptiveContextItem = {
  node: Node;
  depth: number;
  via?: EdgeType;
  edge?: Edge;
};

export type ContextPlan = {
  query: string;
  status: TargetResolution['status'];
  maxDepth: number;
  target?: Node;
  candidates: Node[];
  selectedSymbols: string[];
  nodes: Node[];
  relationships: Edge[];
  context: AdaptiveContextItem[];
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
   * Expands only semantically useful relationships and annotates each result
   * with the edge that introduced it.
   */
  public getAdaptiveContext(startNodeId: string, maxDepth: number = DEFAULT_MAX_DEPTH): AdaptiveContextItem[] {
    const startNode = this.graph.getNode(startNodeId);
    if (!startNode || !Number.isInteger(maxDepth) || maxDepth < 0) return [];

    const relationshipPriority: EdgeType[] = [
      'CALLS',
      'IMPORTS',
      'REFERENCES',
      'EXTENDS',
      'IMPLEMENTS'
    ];
    const priority = new Map(relationshipPriority.map((relation, index) => [relation, index]));
    const visited = new Set<string>([startNodeId]);
    const result: AdaptiveContextItem[] = [{ node: startNode, depth: 0 }];
    let currentQueue = [startNodeId];

    for (let depth = 1; depth <= maxDepth && currentQueue.length > 0; depth++) {
      const nextQueue: string[] = [];
      const candidates = currentQueue.flatMap((nodeId) => this.graph.getEdgesFrom(nodeId))
        .filter((edge) => priority.has(edge.relation) && !visited.has(edge.to))
        .sort((left, right) => (priority.get(left.relation) ?? 0) - (priority.get(right.relation) ?? 0));

      for (const edge of candidates) {
        if (visited.has(edge.to)) continue;

        const node = this.graph.getNode(edge.to);
        if (!node) continue;

        visited.add(edge.to);
        nextQueue.push(edge.to);
        result.push({ node, depth, via: edge.relation, edge });
      }

      currentQueue = nextQueue;
    }

    return result;
  }

  /**
   * Resolves a user request and creates the minimal adaptive context plan.
   */
  public planContext(query: string, maxDepth: number = DEFAULT_MAX_DEPTH): ContextPlan {
    const resolution = this.resolveTarget(query);
    if (resolution.status !== 'matched' || !resolution.target) {
      return {
        query,
        status: resolution.status,
        maxDepth,
        candidates: resolution.candidates,
        selectedSymbols: [],
        nodes: [],
        relationships: [],
        context: []
      };
    }

    const context = this.getAdaptiveContext(resolution.target.id, maxDepth);
    return {
      query,
      status: resolution.status,
      maxDepth,
      target: resolution.target,
      candidates: resolution.candidates,
      selectedSymbols: context.map((item) => item.node.id),
      nodes: context.map((item) => item.node),
      relationships: context.flatMap((item) => item.edge ? [item.edge] : []),
      context
    };
  }

  /**
   * Searches for all nodes matching the given name.
   */
  public findNode(name: string): Node[] {
    return this.graph.getAllNodes().filter((node) => node.name === name);
  }

  /**
   * Resolves descriptive user text to the most relevant graph symbol.
   */
  public resolveTarget(query: string): TargetResolution {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return { query, status: 'not-found', candidates: [] };
    }

    const queryTokens = normalizedQuery.match(/[A-Za-z_$][\w$.-]*/g) ?? [];
    const scored = this.graph.getAllNodes()
      .map((node) => ({ node, score: this.getTargetScore(node, normalizedQuery, queryTokens) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id));

    if (scored.length === 0) {
      return { query, status: 'not-found', candidates: [] };
    }

    const highestScore = scored[0].score;
    const candidates = scored
      .filter((candidate) => candidate.score === highestScore)
      .map((candidate) => candidate.node);

    if (candidates.length !== 1) {
      return { query, status: 'ambiguous', candidates };
    }

    return { query, status: 'matched', target: candidates[0], candidates };
  }

  private getTargetScore(node: Node, query: string, queryTokens: string[]): number {
    const normalizedName = node.name.toLowerCase();
    const exactName = node.name === query.trim();
    const caseInsensitiveName = normalizedName === query.trim().toLowerCase();
    const nameToken = queryTokens.some((token) => token === node.name);
    const caseInsensitiveNameToken = queryTokens.some((token) => token.toLowerCase() === normalizedName);

    if (exactName) return 1000;
    if (caseInsensitiveName) return 900;
    if (nameToken) return 800;
    if (caseInsensitiveNameToken) return 700;

    if (node.filePath) {
      const normalizedPath = node.filePath.toLowerCase();
      const normalizedQuery = query.toLowerCase();
      if (normalizedPath === normalizedQuery || normalizedPath.endsWith(`/${normalizedQuery}`)) {
        return 600;
      }
      if (normalizedPath.includes(normalizedQuery)) {
        return 500;
      }
    }

    return 0;
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
