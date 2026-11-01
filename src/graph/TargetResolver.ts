import {
  Activation,
  QueryInput,
  SAGEGraph,
  SAGENode,
  TargetCandidate,
  TargetResolution,
} from './types';

export class TargetResolver {
  /**
   * Resolve starting target candidates using deterministic priority matching and disambiguation rules.
   */
  public static resolve(
    input: QueryInput,
    graph: SAGEGraph,
    activations: Activation[]
  ): TargetResolution {
    const nodesById = new Map<string, SAGENode>(graph.nodes.map((n) => [n.id, n]));
    const query = input.query.trim();

    // Group activations by nodeId
    const activationsByNode = new Map<string, Activation[]>();
    for (const act of activations) {
      if (!activationsByNode.has(act.nodeId)) {
        activationsByNode.set(act.nodeId, []);
      }
      activationsByNode.get(act.nodeId)!.push(act);
    }

    // Step 1: Detect candidate matches across priorities P1 through P8

    // P1: Exact qualified symbol matches
    const p1Matches = activations.filter((a) => a.reason.startsWith('Exact qualified symbol match'));
    if (p1Matches.length > 0) {
      return this.buildResolution(p1Matches, nodesById, 1, 0.95);
    }

    // P2: Exact symbol name matches
    const p2Matches = activations.filter(
      (a) => a.source === 'query' && a.reason.startsWith('Exact symbol name match')
    );
    if (p2Matches.length > 0) {
      const filteredP2 = this.disambiguateCandidates(p2Matches, input, graph, nodesById);
      if (filteredP2.length === 1) {
        return this.buildResolution(filteredP2, nodesById, 2, 0.92);
      }
      // If multiple remain after disambiguation, report ambiguous
      return {
        targets: filteredP2.map((a) => this.toCandidate(a, nodesById, 2, 0.85)),
        status: 'ambiguous',
      };
    }

    // P3: Exact file name or path matches
    const p3Matches = activations.filter(
      (a) => a.source === 'query' && (a.reason.startsWith('Exact file name match') || a.reason.startsWith('File path suffix match'))
    );
    if (p3Matches.length > 0) {
      const disambiguatedP3 = this.disambiguateCandidates(p3Matches, input, graph, nodesById);
      return this.buildResolution(disambiguatedP3, nodesById, 3, 0.88);
    }

    // P4: Error location (file:line) or error signature matches
    const p4Matches = activations.filter(
      (a) => a.source === 'error' && (a.reason.startsWith('Stack trace crash frame') || a.reason.startsWith('Enclosing symbol for crash frame') || a.reason.includes('Direct THROWS/CATCHES'))
    );
    if (p4Matches.length > 0) {
      // Prioritize enclosing function/method/class containing the crash site over bare blocks or variables
      const symbolsOrBlocks = p4Matches.filter((a) => {
        const node = nodesById.get(a.nodeId);
        return node && (node.level === 'symbol' || node.level === 'block');
      });
      const primarySymbol = symbolsOrBlocks.find((a) => {
        const node = nodesById.get(a.nodeId);
        return node && node.level === 'symbol' && node.type !== 'VARIABLE';
      });
      const selected = primarySymbol ? [primarySymbol] : (symbolsOrBlocks.length > 0 ? symbolsOrBlocks : p4Matches);
      return this.buildResolution(selected, nodesById, 4, 0.90);
    }

    // P5: Workspace cursor location (deepest functional symbol enclosing cursor)
    const p5Matches = activations.filter(
      (a) => a.source === 'workspace' && (a.reason.startsWith('Cursor at line') || a.reason.startsWith('Enclosing symbol containing cursor'))
    );
    if (p5Matches.length > 0) {
      // Prefer function/method/class symbol enclosing the cursor over local variables
      const cursorSymbol =
        p5Matches.find((a) => {
          const node = nodesById.get(a.nodeId);
          return node?.level === 'symbol' && node?.type !== 'VARIABLE';
        }) ||
        p5Matches.find((a) => {
          const node = nodesById.get(a.nodeId);
          return node?.level === 'symbol';
        }) ||
        p5Matches[0];

      return this.buildResolution([cursorSymbol], nodesById, 5, 0.86);
    }

    // P6: Matching domain identifiers / referenced entities (multi-token matches)
    const p6Matches = activations.filter(
      (a) => a.source === 'query' && a.reason.includes('domain identifier') && a.score >= 0.45
    );
    if (p6Matches.length > 0) {
      p6Matches.sort((a, b) => b.score - a.score);
      const topScore = p6Matches[0].score;
      const topCandidates = p6Matches.filter((a) => a.score >= topScore - 0.05);
      const disambiguatedP6 = this.disambiguateCandidates(topCandidates, input, graph, nodesById);
      if (disambiguatedP6.length === 1) {
        return this.buildResolution(disambiguatedP6, nodesById, 6, 0.70);
      }
      return {
        targets: disambiguatedP6.slice(0, 3).map((a) => this.toCandidate(a, nodesById, 6, 0.65)),
        status: 'ambiguous',
      };
    }

    // P7: Deterministic behavior-tag matches
    const p7Matches = activations.filter(
      (a) => a.source === 'query' && a.reason.startsWith('Behavior tag match')
    );
    if (p7Matches.length > 0 && input.activeFile) {
      // Constrained by active file
      const inActiveFile = p7Matches.filter((a) => {
        const node = nodesById.get(a.nodeId);
        return node && (node.filePath.endsWith(input.activeFile!) || input.activeFile!.endsWith(node.filePath));
      });
      if (inActiveFile.length > 0) {
        return this.buildResolution(inActiveFile, nodesById, 7, 0.60);
      }
    }

    // If query has no solid matches and workspace has active file only (no cursor)
    const activeFileOnly = activations.find((a) => a.source === 'workspace' && a.reason.startsWith('Active file in workspace'));
    if (activeFileOnly && query.length > 0) {
      return this.buildResolution([activeFileOnly], nodesById, 5, 0.50);
    }

    // Nothing reliable found
    return {
      targets: [],
      status: 'insufficient_evidence',
    };
  }

  /**
   * Apply disambiguation rules when multiple candidates match at the same priority level.
   */
  private static disambiguateCandidates(
    candidates: Activation[],
    input: QueryInput,
    graph: SAGEGraph,
    nodesById: Map<string, SAGENode>
  ): Activation[] {
    if (candidates.length <= 1) return candidates;

    // Rule 1: File path constraint in query (e.g. "extractCode in ContextExtractor.ts")
    const query = input.query.toLowerCase();
    const fileConstrained = candidates.filter((c) => {
      const node = nodesById.get(c.nodeId);
      if (!node) return false;
      const baseName = node.filePath.split('/').pop()?.toLowerCase();
      return baseName && query.includes(baseName);
    });
    if (fileConstrained.length > 0) {
      return fileConstrained;
    }

    // Rule 2: Workspace constraint (candidate in active file)
    if (input.activeFile) {
      const normActive = input.activeFile.split('\\').join('/');
      const inActiveFile = candidates.filter((c) => {
        const node = nodesById.get(c.nodeId);
        return node && (node.filePath === normActive || node.filePath.endsWith(normActive) || normActive.endsWith(node.filePath));
      });
      if (inActiveFile.length > 0) {
        return inActiveFile;
      }

      // Rule 3: Import constraint (candidate's file is imported by active file)
      const activeFileId = `file:${normActive}`;
      const importedIds = new Set(
        graph.edges
          .filter((e) => e.relation === 'IMPORTS' && (e.sourceId === activeFileId || e.sourceId.endsWith(normActive)))
          .map((e) => e.targetId)
      );

      const importedCandidates = candidates.filter((c) => {
        const node = nodesById.get(c.nodeId);
        if (!node) return false;
        return importedIds.has(`file:${node.filePath}`) || importedIds.has(node.id);
      });
      if (importedCandidates.length > 0) {
        return importedCandidates;
      }
    }

    // Rule 4: Session continuity constraint
    if (input.sessionHistory && input.sessionHistory.length > 0) {
      const inSession = candidates.filter((c) => input.sessionHistory!.includes(c.nodeId));
      if (inSession.length > 0) {
        return inSession;
      }
    }

    return candidates;
  }

  private static buildResolution(
    matches: Activation[],
    nodesById: Map<string, SAGENode>,
    priority: number,
    baseConfidence: number
  ): TargetResolution {
    const targets = matches.map((m) => this.toCandidate(m, nodesById, priority, baseConfidence));
    const status = targets.length === 1 ? 'resolved' : 'ambiguous';
    return { targets, status };
  }

  private static toCandidate(
    activation: Activation,
    nodesById: Map<string, SAGENode>,
    matchPriority: number,
    confidence: number
  ): TargetCandidate {
    const node = nodesById.get(activation.nodeId);
    if (!node) {
      return {
        nodeId: activation.nodeId,
        name: activation.nodeId,
        type: 'UNKNOWN',
        filePath: '',
        startLine: 1,
        endLine: 1,
        confidence,
        matchPriority,
        reasons: [activation.reason],
      };
    }

    return {
      nodeId: node.id,
      name: node.name,
      type: node.type,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      confidence,
      matchPriority,
      reasons: [activation.reason],
    };
  }
}
