import { StandardizedOutput } from '../ast/types';
import { GraphNode, GraphEdge, GraphData } from './types';

export class ASTConverter {
  /**
   * Converts the standard AST output into graph-compatible nodes and edges.
   */
  static convert(astOutput: StandardizedOutput): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Convert file entries into FILE nodes
    for (const filePath of astOutput.files) {
      nodes.push({
        id: `file:${filePath}`,
        type: 'FILE',
        name: filePath.split('/').pop() || filePath,
        filePath,
        startLine: 0,
        endLine: 0,
      });
    }

    // Convert symbols into graph nodes
    for (const symbol of astOutput.symbols) {
      nodes.push({
        id: symbol.id,
        type: symbol.type.toUpperCase(),
        name: symbol.name,
        filePath: symbol.file,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
      });
    }

    // Convert relationships into graph edges
    for (const rel of astOutput.relationships) {
      edges.push({
        sourceId: rel.fromId,
        targetId: rel.toId,
        relation: rel.relation.toUpperCase(),
      });
    }

    return { nodes, edges };
  }
}
