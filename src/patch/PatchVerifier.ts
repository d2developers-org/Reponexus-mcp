import { execSync } from 'node:child_process';
import * as path from 'node:path';

export interface VerifyResult {
  success: boolean;
  errors: string[];
}

/**
 * PatchVerifier
 * Runs `tsc --noEmit` after a patch is applied to confirm no type errors
 * were introduced. This is the final safety gate before a patch is kept.
 */
export class PatchVerifier {
  constructor(private readonly repoRoot: string) {}

  verify(): VerifyResult {
    const tsconfigPath = path.join(this.repoRoot, 'tsconfig.json');

    try {
      execSync('npx tsc --noEmit', {
        cwd: this.repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });

      // Exit code 0 means no errors
      return { success: true, errors: [] };
    } catch (err: any) {
      // tsc exits with code 1 when there are type errors
      const rawOutput: string = (err.stdout ?? '') + (err.stderr ?? '');
      const errors = parseTypeScriptErrors(rawOutput);

      return { success: false, errors };
    }
  }
}

// ─── Error Parser ──────────────────────────────────────────────────────────

function parseTypeScriptErrors(output: string): string[] {
  // Each TS error line looks like:
  //   src/foo/bar.ts(12,5): error TS2345: Argument of type ...
  return output
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.match(/^.*\(\d+,\d+\): error TS\d+:/));
}

