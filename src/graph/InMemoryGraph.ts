import { Node, Edge } from './types';

export class InMemoryGraph {
  private nodes: Map<string, Node>;
  private edges: Edge[];

  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  /**
   * Adds a new node to the graph.
   * If a node with the same ID exists, it will be overwritten.
   */
  public addNode(node: Node): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Adds an edge (relationship) between two nodes.
   * @throws Error if either the source or target node does not exist in the graph.
   */
  public addEdge(edge: Edge): void {
    if (!this.nodes.has(edge.from)) {
      throw new Error(`Cannot add edge: Source node with ID '${edge.from}' does not exist.`);
    }
    if (!this.nodes.has(edge.to)) {
      throw new Error(`Cannot add edge: Target node with ID '${edge.to}' does not exist.`);
    }
    this.edges.push(edge);
  }

  /**
   * Retrieves a node by its ID.
   */
  public getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  /**
   * Retrieves all outgoing edges from a specific node.
   */
  public getEdgesFrom(nodeId: string): Edge[] {
    return this.edges.filter((edge) => edge.from === nodeId);
  }

  /**
   * Retrieves all incoming edges to a specific node.
   */
  public getEdgesTo(nodeId: string): Edge[] {
    return this.edges.filter((edge) => edge.to === nodeId);
  }

  /**
   * Gets a list of all nodes in the graph.
   */
  public getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Gets a list of all edges in the graph.
   */
  public getAllEdges(): Edge[] {
    return this.edges;
  }
}
