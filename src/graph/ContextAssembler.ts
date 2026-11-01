import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Activation,
  ContextPlan,
  QueryAction,
  QueryInput,
  ResolvedRegion,
  RetrievalStatus,
  SAGEGraph,
  SAGENode,
  SignalSource,
  TargetCandidate,
  TargetResolution,
} from './types';
import { QuerySignal } from './signals/QuerySignal';

export interface ContextAssemblerOptions {
  maxTokenBudget?: number; // Estimated ~4 chars per token
  maxRegions?: number;
}

export class ContextAssembler {
  private readonly repoRoot: string;
  private readonly maxTokens: number;
  private readonly maxRegions: number;

  constructor(repositoryRoot: string, options?: ContextAssemblerOptions) {
    this.repoRoot = path.resolve(repositoryRoot);
    this.maxTokens = options?.maxTokenBudget ?? 8000;
    this.maxRegions = options?.maxRegions ?? 15;
  }

  /**
   * Assemble resolved regions and target resolution into the complete ContextPlan.
   */
  public assemble(
    input: QueryInput,
    targetResolution: TargetResolution,
    regions: ResolvedRegion[],
    graph: SAGEGraph,
    allActivations: Activation[] = []
  ): ContextPlan {
    const action = QuerySignal.extractAction(input.query);

    // 0. Signal Summary
    const signalSummary: Record<SignalSource, number> = {
      workspace: 0,
      query: 0,
      error: 0,
      diff: 0,
      session: 0,
    };
    for (const act of allActivations) {
      signalSummary[act.source] = (signalSummary[act.source] || 0) + 1;
    }

    // If there is insufficient evidence to identify any target, honestly return empty regions
    if (targetResolution.status === 'insufficient_evidence') {
      return {
        query: input.query,
        action,
        target: null,
        regions: [],
        code: '',
        dependencies: [],
        status: 'insufficient_evidence',
        truncated: false,
        signalSummary,
      };
    }

    // 1. Primary target
    const primaryTarget: TargetCandidate | null =
      targetResolution.targets.length > 0 ? targetResolution.targets[0] : null;

    // 2. Budget and Region Trimming
    let selectedRegions = [...regions];
    let truncated = false;

    // Limit maximum regions
    if (selectedRegions.length > this.maxRegions) {
      // Ensure primary target's region is preserved
      const targetNodeId = primaryTarget?.nodeId;
      const targetRegion = selectedRegions.find((r) => r.nodeId === targetNodeId);
      const otherRegions = selectedRegions.filter((r) => r.nodeId !== targetNodeId);

      const keptOthers = otherRegions.slice(0, this.maxRegions - (targetRegion ? 1 : 0));
      selectedRegions = targetRegion ? [targetRegion, ...keptOthers] : keptOthers;
      truncated = true;
    }

    // 3. Extract Source Code and apply token budget
    const codeBlocks: string[] = [];
    const finalRegions: ResolvedRegion[] = [];
    let estimatedChars = 0;
    const maxChars = this.maxTokens * 4;

    for (const region of selectedRegions) {
      const code = this.extractSource(region.filePath, region.startLine, region.endLine);
      const header = `// --- ${region.filePath} (L${region.startLine}-L${region.endLine}) ---`;
      const block = `${header}\n${code}`;
      const blockChars = block.length;

      // Don't exceed char budget unless it is the primary target region
      const isTargetRegion = primaryTarget && region.nodeId === primaryTarget.nodeId;
      if (!isTargetRegion && estimatedChars + blockChars > maxChars) {
        truncated = true;
        continue;
      }

      codeBlocks.push(block);
      finalRegions.push(region);
      estimatedChars += blockChars;
    }

    // 4. Trace Dependencies between included nodes
    const includedNodeIds = new Set(finalRegions.map((r) => r.nodeId));
    if (primaryTarget) includedNodeIds.add(primaryTarget.nodeId);

    const relevantDependencies: Array<{ source: string; target: string; relation: string }> = [];
    for (const edge of graph.edges) {
      if (includedNodeIds.has(edge.sourceId) || includedNodeIds.has(edge.targetId)) {
        relevantDependencies.push({
          source: edge.sourceId,
          target: edge.targetId,
          relation: edge.relation,
        });
      }
    }

    // 5. Calculate Status
    let status: RetrievalStatus = 'matched';
    if (finalRegions.length === 0) {
      status = 'insufficient_evidence';
    } else if (targetResolution.status === 'ambiguous' || (primaryTarget && primaryTarget.confidence < 0.65)) {
      status = 'ambiguous';
    }

    return {
      query: input.query,
      action,
      target: primaryTarget,
      regions: finalRegions,
      code: codeBlocks.join('\n\n'),
      dependencies: relevantDependencies.slice(0, 50),
      status,
      truncated,
      signalSummary,
    };
  }

  private extractSource(filePath: string, startLine: number, endLine: number): string {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.repoRoot, filePath);
    if (!fs.existsSync(absPath)) {
      return `// [File not found on disk: ${filePath}]`;
    }
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine);
    return lines.slice(startIdx, endIdx).join('\n');
  }
}
