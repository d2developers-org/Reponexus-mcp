import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  QueryInput,
  ResolvedRegion,
  SAGEGraph,
  SAGENode,
  SignalSource,
} from './types';
import { ActivatedNodeResult } from './ActivationEngine';

export interface LineResolverOptions {
  contextWindowLines?: number;
}

export class LineResolver {
  private readonly contextWindow: number;
  private readonly repoRoot: string;
  private readonly fileLinesCache: Map<string, string[]> = new Map();

  constructor(repositoryRoot: string, options?: LineResolverOptions) {
    this.repoRoot = path.resolve(repositoryRoot);
    this.contextWindow = options?.contextWindowLines ?? 5;
  }

  private getFileLines(filePath: string): string[] {
    if (this.fileLinesCache.has(filePath)) {
      return this.fileLinesCache.get(filePath)!;
    }
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.repoRoot, filePath);
    let lines: string[] = [];
    if (fs.existsSync(absPath)) {
      lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/);
    }
    this.fileLinesCache.set(filePath, lines);
    return lines;
  }

  /**
   * Narrow activated nodes to exact line ranges based on evidence.
   */
  public resolve(
    activatedResults: ActivatedNodeResult[],
    input: QueryInput,
    graph: SAGEGraph
  ): ResolvedRegion[] {
    const regions: ResolvedRegion[] = [];
    const nodesById = new Map<string, SAGENode>(graph.nodes.map((n) => [n.id, n]));

    for (const item of activatedResults) {
      const node = item.node;
      // Skip file nodes from being standalone line ranges; we only want specific symbols/blocks
      if (node.level === 'file') continue;

      const fileLines = this.getFileLines(node.filePath);
      const totalFileLines = fileLines.length > 0 ? fileLines.length : Infinity;

      let targetStart = node.startLine;
      let targetEnd = node.endLine;
      const reasons: string[] = [...item.reasons];
      const pinnedBy: SignalSource[] = [...item.sources];

      // Strategy 1: Error crash line pinning
      const isErrorPinned = item.sources.includes('error') && input.errors;
      let handledByPin = false;

      if (isErrorPinned && input.errors) {
        // Extract any line number referencing this file
        const lineMatches = input.errors.match(new RegExp(`${path.basename(node.filePath)}:(\\d+)`));
        if (lineMatches && lineMatches[1]) {
          const crashLine = parseInt(lineMatches[1], 10);
          if (crashLine >= node.startLine && crashLine <= node.endLine) {
            targetStart = Math.max(node.startLine, crashLine - this.contextWindow);
            targetEnd = Math.min(node.endLine, crashLine + this.contextWindow);
            reasons.push(`Pinned to crash frame line ${crashLine} (±${this.contextWindow} lines)`);
            handledByPin = true;
          }
        }
      }

      // Strategy 2: Workspace cursor pinning
      if (!handledByPin && item.sources.includes('workspace') && input.cursorLine && input.activeFile) {
        const normActive = input.activeFile.split('\\').join('/');
        if (node.filePath === normActive || node.filePath.endsWith(normActive) || normActive.endsWith(node.filePath)) {
          const cursor = input.cursorLine;
          if (cursor >= node.startLine && cursor <= node.endLine) {
            targetStart = Math.max(node.startLine, cursor - this.contextWindow);
            targetEnd = Math.min(node.endLine, cursor + this.contextWindow);
            reasons.push(`Pinned to workspace cursor line ${cursor} (±${this.contextWindow} lines)`);
            handledByPin = true;
          }
        }
      }

      // Strategy 3: Block-level nodes (already narrow and specific)
      if (!handledByPin && node.level === 'block') {
        targetStart = node.startLine;
        targetEnd = node.endLine;
        reasons.push(`Structural control block ${node.name}`);
        handledByPin = true;
      }

      // Strategy 4: Query identifier scanning within the symbol
      if (!handledByPin && item.sources.includes('query')) {
        const queryTokens = input.query.match(/[A-Za-z0-9_$]{3,}/g) || [];
        const matchingLineNumbers: number[] = [];

        for (let l = node.startLine; l <= Math.min(node.endLine, totalFileLines); l++) {
          const lineText = fileLines[l - 1] || '';
          if (queryTokens.some((tok) => lineText.includes(tok) && !lineText.includes(`class ${tok}`))) {
            matchingLineNumbers.push(l);
          }
        }

        if (matchingLineNumbers.length > 0 && matchingLineNumbers.length <= 4) {
          const first = Math.min(...matchingLineNumbers);
          const last = Math.max(...matchingLineNumbers);
          targetStart = Math.max(node.startLine, first - this.contextWindow);
          targetEnd = Math.min(node.endLine, last + this.contextWindow);
          reasons.push(`Pinned to lines referencing query identifiers (${matchingLineNumbers.join(', ')})`);
          handledByPin = true;
        }
      }

      // Strategy 5: Fallback to full symbol boundary (clamped)
      targetStart = Math.max(1, targetStart);
      targetEnd = Math.min(totalFileLines, Math.max(targetStart, targetEnd));

      regions.push({
        filePath: node.filePath,
        startLine: targetStart,
        endLine: targetEnd,
        nodeId: node.id,
        activationScore: item.score,
        reasons,
        pinnedBy,
      });
    }

    // Merge overlapping line ranges within the same file
    return this.mergeOverlappingRegions(regions);
  }

  /**
   * Merge overlapping or immediately adjacent line ranges in the same file.
   */
  private mergeOverlappingRegions(regions: ResolvedRegion[]): ResolvedRegion[] {
    if (regions.length <= 1) return regions;

    const byFile = new Map<string, ResolvedRegion[]>();
    for (const r of regions) {
      if (!byFile.has(r.filePath)) byFile.set(r.filePath, []);
      byFile.get(r.filePath)!.push(r);
    }

    const merged: ResolvedRegion[] = [];

    for (const [filePath, fileRegions] of byFile.entries()) {
      // Sort ascending by startLine
      fileRegions.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);

      let current = fileRegions[0];

      for (let i = 1; i < fileRegions.length; i++) {
        const next = fileRegions[i];

        // If overlapping or separated by <= 2 lines, merge
        if (next.startLine <= current.endLine + 2) {
          current = {
            filePath,
            startLine: current.startLine,
            endLine: Math.max(current.endLine, next.endLine),
            nodeId: current.activationScore >= next.activationScore ? current.nodeId : next.nodeId,
            activationScore: Math.max(current.activationScore, next.activationScore),
            reasons: Array.from(new Set([...current.reasons, ...next.reasons])),
            pinnedBy: Array.from(new Set([...current.pinnedBy, ...next.pinnedBy])),
          };
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
    }

    // Sort descending by activationScore
    merged.sort((a, b) => b.activationScore - a.activationScore);
    return merged;
  }
}
