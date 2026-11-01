import { Activation, QueryInput, SAGEGraph, SAGENode, SignalSource } from '../types';
import { SignalCollector } from './SignalCollector';

function normalizePath(filePath: string): string {
  return filePath.split('\\').join('/').replace(/^\.?\//, '');
}

export class WorkspaceSignal implements SignalCollector {
  public readonly source: SignalSource = 'workspace';

  public collect(input: QueryInput, graph: SAGEGraph): Activation[] {
    const activations: Activation[] = [];
    if (!input.activeFile && (!input.openFiles || input.openFiles.length === 0)) {
      return activations;
    }

    const fileNodes = graph.nodes.filter((n) => n.level === 'file');

    // 1. Process activeFile
    if (input.activeFile) {
      const targetNormalized = normalizePath(input.activeFile);
      const activeFileNode = fileNodes.find(
        (n) => n.filePath === targetNormalized || n.filePath.endsWith(targetNormalized) || targetNormalized.endsWith(n.filePath)
      );

      if (activeFileNode) {
        activations.push({
          nodeId: activeFileNode.id,
          score: 1.0,
          source: this.source,
          reason: `Active file in workspace: ${activeFileNode.filePath}`,
        });

        // 2. Process cursorLine inside the active file
        if (input.cursorLine !== undefined && input.cursorLine > 0) {
          const line = input.cursorLine;
          const matchingNodes = graph.nodes.filter(
            (n) =>
              (n.filePath === activeFileNode.filePath || n.id === activeFileNode.id) &&
              n.startLine <= line &&
              n.endLine >= line
          );

          // Sort by span length ascending: deepest / most specific first (Block < Symbol < File)
          matchingNodes.sort((a, b) => {
            const spanA = a.endLine - a.startLine;
            const spanB = b.endLine - b.startLine;
            if (spanA !== spanB) return spanA - spanB;
            // Prefer block over symbol, symbol over file
            const priority: Record<string, number> = { block: 1, symbol: 2, file: 3 };
            return (priority[a.level] || 4) - (priority[b.level] || 4);
          });

          const deepest = matchingNodes[0];
          if (deepest && deepest.id !== activeFileNode.id) {
            activations.push({
              nodeId: deepest.id,
              score: 1.0,
              source: this.source,
              reason: `Cursor at line ${line} inside ${deepest.level} '${deepest.name}'`,
            });

            // If deepest was a block or a local variable, also activate its enclosing function/method/class
            const enclosingSymbol = matchingNodes.find(
              (n) => n.level === 'symbol' && (n.type === 'FUNCTION' || n.type === 'METHOD' || n.type === 'CLASS')
            );
            if (enclosingSymbol && enclosingSymbol.id !== deepest.id) {
              activations.push({
                nodeId: enclosingSymbol.id,
                score: 0.95,
                source: this.source,
                reason: `Enclosing symbol containing cursor at line ${line}: '${enclosingSymbol.name}'`,
              });
            }
          }
        }
      }
    }

    // 3. Process openFiles
    if (input.openFiles && input.openFiles.length > 0) {
      for (const openFile of input.openFiles) {
        const norm = normalizePath(openFile);
        const match = fileNodes.find(
          (n) => n.filePath === norm || n.filePath.endsWith(norm) || norm.endsWith(n.filePath)
        );
        if (match && (!input.activeFile || match.filePath !== normalizePath(input.activeFile))) {
          activations.push({
            nodeId: match.id,
            score: 0.4,
            source: this.source,
            reason: `Open file tab in workspace: ${match.filePath}`,
          });
        }
      }
    }

    return activations;
  }
}
