import { Activation, QueryInput, SAGEGraph, SAGENode, SignalSource } from '../types';
import { SignalCollector } from './SignalCollector';

function normalizePath(filePath: string): string {
  return filePath.split('\\').join('/').replace(/^\.?\//, '');
}

export class ErrorSignal implements SignalCollector {
  public readonly source: SignalSource = 'error';

  public collect(input: QueryInput, graph: SAGEGraph): Activation[] {
    const activations: Activation[] = [];
    if (!input.errors || !input.errors.trim()) {
      return activations;
    }

    const errorText = input.errors.trim();

    // 1. Stack trace frame detection
    // Matches: at fn (path/file.ts:42:15) or at path/file.ts:42 or File "path/file.py", line 42
    const jsFrameRegex = /(?:at\s+(?:[A-Za-z0-9_$.<>]+\s+\()?|[\(\s])([A-Za-z0-9_\-\.\/\\:]+\.[a-zA-Z0-9]+):(\d+)(?::\d+)?\)?/g;
    const pyFrameRegex = /File\s+["']([^"']+)["'],\s+line\s+(\d+)/g;

    const frames: Array<{ file: string; line: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = jsFrameRegex.exec(errorText)) !== null) {
      const rawFile = match[1];
      const line = parseInt(match[2], 10);
      if (!isNaN(line) && line > 0 && !rawFile.includes('node_modules')) {
        frames.push({ file: normalizePath(rawFile), line });
      }
    }

    while ((match = pyFrameRegex.exec(errorText)) !== null) {
      const rawFile = match[1];
      const line = parseInt(match[2], 10);
      if (!isNaN(line) && line > 0 && !rawFile.includes('site-packages')) {
        frames.push({ file: normalizePath(rawFile), line });
      }
    }

    for (const frame of frames) {
      // Find matching nodes for this file and line
      const candidates = graph.nodes.filter((n) => {
        const matchesFile = n.filePath === frame.file || n.filePath.endsWith(frame.file) || frame.file.endsWith(n.filePath);
        return matchesFile && n.startLine <= frame.line && n.endLine >= frame.line;
      });

      if (candidates.length > 0) {
        // Sort by span length: deepest/most specific first (block < symbol < file)
        candidates.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
        const deepest = candidates[0];
        activations.push({
          nodeId: deepest.id,
          score: 1.0,
          source: this.source,
          reason: `Stack trace crash frame points to line ${frame.line} in ${deepest.filePath} (${deepest.name})`,
        });

        // Also activate enclosing symbol if deepest was a block
        if (deepest.level === 'block') {
          const enclosing = candidates.find((c) => c.level === 'symbol');
          if (enclosing) {
            activations.push({
              nodeId: enclosing.id,
              score: 0.95,
              source: this.source,
              reason: `Enclosing symbol for crash frame at line ${frame.line}: '${enclosing.name}'`,
            });
          }
        }
      }
    }

    // 2. Error message and error pattern matching
    // Extract error header like "Error: ...", "TypeError: ...", or first line
    const lines = errorText.split(/\r?\n/);
    const headerLine = lines[0] || '';
    const errTypeMatch = headerLine.match(/([A-Z][A-Za-z0-9_]*(?:Error|Exception))/);
    const errorType = errTypeMatch ? errTypeMatch[1] : undefined;

    for (const node of graph.nodes) {
      // Check node errorPatterns against the error text
      for (const pattern of node.annotation.errorPatterns) {
        if (pattern.length > 3 && errorText.toLowerCase().includes(pattern.toLowerCase())) {
          activations.push({
            nodeId: node.id,
            score: 0.90,
            source: this.source,
            reason: `Error message matches indexed pattern '${pattern}'`,
          });
        }
      }

      // If specific error type identified, check THROWS / CATCHES edges
      if (errorType) {
        const errorTarget = `error:${errorType}`;
        const hasThrowEdge = graph.edges.some(
          (e) => (e.relation === 'THROWS' || e.relation === 'CATCHES') && e.sourceId === node.id && e.targetId === errorTarget
        );
        if (hasThrowEdge) {
          activations.push({
            nodeId: node.id,
            score: 0.85,
            source: this.source,
            reason: `Direct THROWS/CATCHES relationship with '${errorType}'`,
          });
        }
      }
    }

    return activations;
  }
}

