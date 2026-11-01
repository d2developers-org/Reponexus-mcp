import {
  Activation,
  EnrichedEdgeRelation,
  GraphEdge,
  SAGEGraph,
  SAGENode,
  SignalSource,
  TargetResolution,
} from './types';

export interface ActivatedNodeResult {
  node: SAGENode;
  score: number;
  reasons: string[];
  sources: SignalSource[];
}

export interface ActivationEngineOptions {
  maxHops?: number;
  activationThreshold?: number;
  multiSignalBonus?: number;
}

export class ActivationEngine {
  private readonly maxHops: number;
  private readonly threshold: number;
  private readonly multiSignalBonus: number;

  // Directional edge decay factors
  private readonly edgeDecay: Record<string, number> = {
    CONTAINS_UP: 0.50,    // child -> parent (enclosing context)
    CONTAINS_DOWN: 0.00,  // parent -> children (no auto-propagation to siblings)
    CALLS: 0.70,          // target calls callee
    CALLED_BY: 0.65,      // caller calls target
    IMPORTS: 0.55,        // file imports module
    THROWS: 0.80,         // symbol/block throws error
    CATCHES: 0.80,        // catch block catches error
    EXPORTS: 0.30,        // file exports symbol
    IMPLEMENTS: 0.40,     // class implements interface
  };

  constructor(options?: ActivationEngineOptions) {
    this.maxHops = options?.maxHops ?? 3;
    this.threshold = options?.activationThreshold ?? 0.15;
    this.multiSignalBonus = options?.multiSignalBonus ?? 0.15;
  }

  /**
   * Run spreading max-propagation activation over the graph.
   */
  public activate(
    graph: SAGEGraph,
    activations: Activation[],
    targetResolution?: TargetResolution
  ): ActivatedNodeResult[] {
    const nodesById = new Map<string, SAGENode>(graph.nodes.map((n) => [n.id, n]));

    // Step 1: Index edges by source and target
    const outgoingEdges = new Map<string, GraphEdge[]>();
    const incomingEdges = new Map<string, GraphEdge[]>();

    for (const edge of graph.edges) {
      if (!outgoingEdges.has(edge.sourceId)) outgoingEdges.set(edge.sourceId, []);
      outgoingEdges.get(edge.sourceId)!.push(edge);

      if (!incomingEdges.has(edge.targetId)) incomingEdges.set(edge.targetId, []);
      incomingEdges.get(edge.targetId)!.push(edge);
    }

    // Step 2: Merge initial activations per node
    const baseScores = new Map<string, number>();
    const nodeReasons = new Map<string, Set<string>>();
    const nodeSources = new Map<string, Set<SignalSource>>();

    for (const act of activations) {
      if (!baseScores.has(act.nodeId)) {
        baseScores.set(act.nodeId, 0);
        nodeReasons.set(act.nodeId, new Set());
        nodeSources.set(act.nodeId, new Set());
      }
      nodeReasons.get(act.nodeId)!.add(act.reason);
      nodeSources.get(act.nodeId)!.add(act.source);
    }

    // Combine multiple signals on same node using bounded bonus
    for (const [nodeId, scoreSet] of baseScores.entries()) {
      const nodeActs = activations.filter((a) => a.nodeId === nodeId);
      if (nodeActs.length === 0) continue;

      const sorted = nodeActs.map((a) => a.score).sort((a, b) => b - a);
      const primary = sorted[0];
      const othersSum = sorted.slice(1).reduce((sum, s) => sum + s, 0);
      const combined = Math.min(1.0, primary + this.multiSignalBonus * othersSum);
      baseScores.set(nodeId, combined);
    }

    // If a primary target was resolved, ensure it has the highest initial seed (1.0)
    if (targetResolution && targetResolution.status === 'resolved' && targetResolution.targets.length > 0) {
      const primaryTarget = targetResolution.targets[0];
      baseScores.set(primaryTarget.nodeId, 1.0);
      if (!nodeReasons.has(primaryTarget.nodeId)) {
        nodeReasons.set(primaryTarget.nodeId, new Set());
        nodeSources.set(primaryTarget.nodeId, new Set());
      }
      for (const r of primaryTarget.reasons) {
        nodeReasons.get(primaryTarget.nodeId)!.add(r);
      }
    }

    // Step 3: Bounded Max-Propagation P(v) = max(P(u) * decay)
    const bestPathScores = new Map<string, number>();
    const queue: Array<{ nodeId: string; score: number; hop: number }> = [];

    for (const [nodeId, score] of baseScores.entries()) {
      if (score >= this.threshold) {
        queue.push({ nodeId, score, hop: 0 });
      }
    }

    // Process propagation
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.hop >= this.maxHops) continue;

      const currentNode = nodesById.get(current.nodeId);
      const edges = outgoingEdges.get(current.nodeId) || [];

      for (const edge of edges) {
        let decay = this.edgeDecay[edge.relation] ?? 0.50;

        // Apply directional CONTAINS rules:
        if (edge.relation === 'CONTAINS') {
          // If source is a file/class and target is child symbol, do NOT auto-propagate to siblings!
          if (currentNode && (currentNode.level === 'file' || currentNode.level === 'symbol')) {
            const targetNode = nodesById.get(edge.targetId);
            // Sibling isolation: parent -> child symbols gets 0.00 decay
            if (targetNode && targetNode.level === 'symbol') {
              decay = this.edgeDecay.CONTAINS_DOWN;
            } else if (targetNode && targetNode.level === 'block') {
              // Only allow down to block if block has relevant tags or error patterns
              decay = targetNode.annotation.errorPatterns.length > 0 ? 0.60 : 0.00;
            }
          }
        }

        // If edge goes up to parent container (child -> parent), use CONTAINS_UP decay
        if (currentNode?.parentId === edge.targetId) {
          decay = this.edgeDecay.CONTAINS_UP;
        }

        if (decay <= 0.00) continue;

        const propagatedScore = current.score * decay;
        if (propagatedScore < this.threshold) continue;

        const existingBest = bestPathScores.get(edge.targetId) || 0;
        const existingBase = baseScores.get(edge.targetId) || 0;

        // Max-propagation: only update and re-queue if propagated score strictly improves existing
        if (propagatedScore > existingBest && propagatedScore > existingBase) {
          bestPathScores.set(edge.targetId, propagatedScore);

          if (!nodeReasons.has(edge.targetId)) {
            nodeReasons.set(edge.targetId, new Set());
            nodeSources.set(edge.targetId, new Set());
          }
          const sourceName = currentNode?.name || current.nodeId;
          nodeReasons.get(edge.targetId)!.add(
            `Propagated via ${edge.relation} from '${sourceName}' (score: ${propagatedScore.toFixed(2)})`
          );

          queue.push({
            nodeId: edge.targetId,
            score: propagatedScore,
            hop: current.hop + 1,
          });
        }
      }

      // Also propagate upwards to parent node if parentId exists and is not already covered
      const outList = outgoingEdges.get(current.nodeId) || [];
      if (currentNode && currentNode.parentId && outList.every((e) => e.targetId !== currentNode.parentId)) {
        const parentId = currentNode.parentId;
        const decay = this.edgeDecay.CONTAINS_UP;
        const propagatedScore = current.score * decay;

        if (propagatedScore >= this.threshold) {
          const existingBest = bestPathScores.get(parentId) || 0;
          const existingBase = baseScores.get(parentId) || 0;

          if (propagatedScore > existingBest && propagatedScore > existingBase) {
            bestPathScores.set(parentId, propagatedScore);
            if (!nodeReasons.has(parentId)) {
              nodeReasons.set(parentId, new Set());
              nodeSources.set(parentId, new Set());
            }
            nodeReasons.get(parentId)!.add(
              `Enclosing parent of '${currentNode.name}' (score: ${propagatedScore.toFixed(2)})`
            );
            queue.push({
              nodeId: parentId,
              score: propagatedScore,
              hop: current.hop + 1,
            });
          }
        }
      }
    }

    // Step 4: Combine base score and best path score
    const allNodeIds = new Set([...baseScores.keys(), ...bestPathScores.keys()]);
    const results: ActivatedNodeResult[] = [];

    for (const nodeId of allNodeIds) {
      const node = nodesById.get(nodeId);
      if (!node) continue;

      const base = baseScores.get(nodeId) || 0;
      const pathScore = bestPathScores.get(nodeId) || 0;
      const finalScore = Math.min(1.0, Math.max(base, pathScore));

      if (finalScore >= this.threshold) {
        results.push({
          node,
          score: finalScore,
          reasons: Array.from(nodeReasons.get(nodeId) || []),
          sources: Array.from(nodeSources.get(nodeId) || []),
        });
      }
    }

    // Step 5: Sort descending by score, prioritizing primary targets and symbols over files on equal score
    results.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      if (targetResolution && targetResolution.status === 'resolved' && targetResolution.targets.length > 0) {
        if (a.node.id === targetResolution.targets[0].nodeId) return -1;
        if (b.node.id === targetResolution.targets[0].nodeId) return 1;
      }
      const priority: Record<string, number> = { symbol: 1, block: 2, file: 3 };
      return (priority[a.node.level] || 4) - (priority[b.node.level] || 4);
    });

    return results;
  }
}
