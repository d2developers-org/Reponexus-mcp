import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HunkLine {
  type: 'context' | 'add' | 'remove';
  content: string;
}

export interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

export interface ParsedFilePatch {
  oldPath: string;  // e.g. "src/graph/types.ts"
  newPath: string;
  hunks: ParsedHunk[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  affectedFiles: string[];
}

/**
 * PatchValidator
 * Parses a unified diff and dry-runs it against the current file system:
 *  - verifies affected files exist on disk
 *  - verifies every context/remove line matches the actual source
 * Does NOT write anything to disk.
 */
export class PatchValidator {
  constructor(private readonly repoRoot: string) {}

  validate(patch: string): ValidationResult {
    const errors: string[] = [];
    const affectedFiles: string[] = [];

    let filePatches: ParsedFilePatch[];
    try {
      filePatches = parsePatch(patch);
    } catch (e: any) {
      return { valid: false, errors: [`Failed to parse patch: ${e.message}`], affectedFiles: [] };
    }

    if (filePatches.length === 0) {
      return { valid: false, errors: ['Patch contains no file changes.'], affectedFiles: [] };
    }

    for (const fp of filePatches) {
      const absPath = path.resolve(this.repoRoot, fp.oldPath);
      affectedFiles.push(fp.oldPath);

      // New files (--- /dev/null) don't need to exist
      if (fp.oldPath === '/dev/null') continue;

      if (!fs.existsSync(absPath)) {
        errors.push(`File not found: ${fp.oldPath}`);
        continue;
      }

      const sourceLines = fs.readFileSync(absPath, 'utf8').split('\n');

      for (const hunk of fp.hunks) {
        // oldStart is 1-indexed
        let cursor = hunk.oldStart - 1; // convert to 0-indexed

        for (const line of hunk.lines) {
          if (line.type === 'add') continue; // added lines don't exist in source

          const sourceLine = sourceLines[cursor];
          if (sourceLine === undefined) {
            errors.push(
              `${fp.oldPath}:${cursor + 1}: Hunk references line beyond end of file.`
            );
            break;
          }

          if (sourceLine !== line.content) {
            errors.push(
              `${fp.oldPath}:${cursor + 1}: Context mismatch.\n` +
              `  Expected: ${JSON.stringify(line.content)}\n` +
              `  Found:    ${JSON.stringify(sourceLine)}`
            );
          }

          cursor++;
        }
      }
    }

    return { valid: errors.length === 0, errors, affectedFiles };
  }
}

// ─── Patch Parser ──────────────────────────────────────────────────────────

export function parsePatch(patch: string): ParsedFilePatch[] {
  const files: ParsedFilePatch[] = [];
  const lines = patch.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find "--- a/..." line
    if (!lines[i].startsWith('--- ')) { i++; continue; }

    const oldPath = lines[i].replace(/^--- (a\/)?/, '').trim();
    i++;

    if (i >= lines.length || !lines[i].startsWith('+++ ')) {
      throw new Error(`Expected "+++ " after "--- " at line ${i}`);
    }
    const newPath = lines[i].replace(/^\+\+\+ (b\/)?/, '').trim();
    i++;

    const hunks: ParsedHunk[] = [];

    while (i < lines.length && lines[i].startsWith('@@ ')) {
      // Parse @@ -oldStart,oldCount +newStart,newCount @@
      const match = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) { i++; continue; }

      const oldStart = parseInt(match[1], 10);
      const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      const newStart = parseInt(match[3], 10);
      const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;
      i++;

      const hunkLines: HunkLine[] = [];
      let consumed = { old: 0, new: 0 };

      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('--- ')) {
        const raw = lines[i];
        if (raw.startsWith('+')) {
          hunkLines.push({ type: 'add', content: raw.slice(1) });
          consumed.new++;
        } else if (raw.startsWith('-')) {
          hunkLines.push({ type: 'remove', content: raw.slice(1) });
          consumed.old++;
        } else if (raw.startsWith(' ')) {
          hunkLines.push({ type: 'context', content: raw.slice(1) });
          consumed.old++;
          consumed.new++;
        } else if (raw === '' && (consumed.old < oldCount || consumed.new < newCount)) {
          hunkLines.push({ type: 'context', content: '' });
          consumed.old++;
          consumed.new++;
        } else {
          // Empty trailing line or unexpected line outside hunk
          break;
        }
        i++;
      }

      hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
    }

    files.push({ oldPath, newPath, hunks });
  }

  return files;
}

