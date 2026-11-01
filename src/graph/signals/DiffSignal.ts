import { Activation, QueryInput, SAGEGraph, SignalSource } from '../types';
import { SignalCollector } from './SignalCollector';

function normalizePath(filePath: string): string {
  return filePath.split('\\').join('/').replace(/^\.?\//, '').replace(/^[ab]\//, '');
}

interface DiffHunk {
  file: string;
  startLine: number;
  lineCount: number;
}

export class DiffSignal implements SignalCollector {
  public readonly source: SignalSource = 'diff';

  public collect(input: QueryInput, graph: SAGEGraph): Activation[] {
    const activations: Activation[] = [];
    if (!input.diff || !input.diff.trim()) {
      return activations;
    }

    const diffText = input.diff.trim();
    const hunks: DiffHunk[] = [];
    const changedFiles = new Set<string>();

    let currentFile = '';

    const lines = diffText.split(/\r?\n/);
    for (const line of lines) {
      // diff --git a/path b/path or +++ b/path
      if (line.startsWith('diff --git ')) {
        const parts = line.split(' ');
        if (parts.length >= 4) {
          currentFile = normalizePath(parts[3]);
          changedFiles.add(currentFile);
        }
      } else if (line.startsWith('+++ b/')) {
        currentFile = normalizePath(line.slice(6));
        changedFiles.add(currentFile);
      } else if (line.startsWith('@@ ') && currentFile) {
        // @@ -oldStart,oldLen +newStart,newLen @@
        const match = line.match(/@@\s+-[0-9,]+\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (match) {
          const startLine = parseInt(match[1], 10);
          const lineCount = match[2] ? parseInt(match[2], 10) : 1;
          hunks.push({
            file: currentFile,
            startLine,
            lineCount,
          });
        }
      }
    }

    // 1. Activate changed files
    for (const file of changedFiles) {
      const fileNode = graph.nodes.find(
        (n) => n.level === 'file' && (n.filePath === file || n.filePath.endsWith(file) || file.endsWith(n.filePath))
      );
      if (fileNode) {
        activations.push({
          nodeId: fileNode.id,
          score: 0.60,
          source: this.source,
          reason: `Modified in git diff: ${fileNode.filePath}`,
        });
      }
    }

    // 2. Activate symbols and blocks overlapping changed hunks
    for (const hunk of hunks) {
      const hunkEnd = hunk.startLine + Math.max(1, hunk.lineCount) - 1;
      const matchingNodes = graph.nodes.filter((n) => {
        const matchesFile = n.filePath === hunk.file || n.filePath.endsWith(hunk.file) || hunk.file.endsWith(n.filePath);
        if (!matchesFile) return false;
        // Overlap condition: startA <= endB && endA >= startB
        return n.startLine <= hunkEnd && n.endLine >= hunk.startLine;
      });

      for (const node of matchingNodes) {
        if (node.level === 'symbol' || node.level === 'block') {
          activations.push({
            nodeId: node.id,
            score: 0.70,
            source: this.source,
            reason: `Directly modified in diff (lines ${hunk.startLine}-${hunkEnd})`,
          });
        }
      }
    }

    return activations;
  }
}

