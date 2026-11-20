import * as fs from 'node:fs';
import * as path from 'node:path';
import { parsePatch } from './PatchValidator';

/**
 * PatchApplier
 * Applies a parsed unified diff to the file system in-memory first,
 * then writes each modified file atomically (write to .tmp → rename).
 */
export class PatchApplier {
  constructor(private readonly repoRoot: string) {}

  /**
   * Applies the given unified diff patch.
   * Returns the list of modified file paths (relative to repoRoot).
   * Throws on any application error — caller is responsible for rollback.
   */
  apply(patch: string): string[] {
    const filePatches = parsePatch(patch);
    const modifiedFiles: string[] = [];

    for (const fp of filePatches) {
      const isNewFile = fp.oldPath === '/dev/null';
      const targetRelPath = fp.newPath === '/dev/null' ? fp.oldPath : fp.newPath;
      const absPath = path.resolve(this.repoRoot, targetRelPath);

      // Deletion: remove/dev/null target means delete the file
      if (fp.newPath === '/dev/null') {
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        modifiedFiles.push(targetRelPath);
        continue;
      }

      // Read existing content (or start blank for new files)
      let sourceLines: string[];
      if (isNewFile) {
        sourceLines = [];
      } else {
        if (!fs.existsSync(absPath)) {
          throw new Error(`Cannot apply patch: file not found: ${targetRelPath}`);
        }
        sourceLines = fs.readFileSync(absPath, 'utf8').split('\n');
      }

      // Apply each hunk
      const resultLines = applyHunks(sourceLines, fp.hunks);

      // Atomic write: write to .tmp then rename
      const tmpPath = absPath + '.agcp.tmp';
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(tmpPath, resultLines.join('\n'), 'utf8');
      fs.renameSync(tmpPath, absPath);

      modifiedFiles.push(targetRelPath);
    }

    return modifiedFiles;
  }
}

// ─── Hunk Application ─────────────────────────────────────────────────────

function applyHunks(
  sourceLines: string[],
  hunks: ReturnType<typeof parsePatch>[number]['hunks']
): string[] {
  const result: string[] = [...sourceLines];

  // Apply hunks in reverse order so earlier line offsets stay valid
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sorted) {
    // oldStart is 1-indexed; convert to 0-indexed splice offset
    const spliceStart = hunk.oldStart - 1;

    // Collect the lines that will replace the removed/context block
    const incoming: string[] = [];
    let removeCount = 0;

    for (const line of hunk.lines) {
      if (line.type === 'context') {
        incoming.push(line.content);
        removeCount++;
      } else if (line.type === 'remove') {
        removeCount++; // will be spliced out
      } else if (line.type === 'add') {
        incoming.push(line.content);
      }
    }

    // Replace the old block with the new block
    result.splice(spliceStart, removeCount, ...incoming);
  }

  return result;
}

