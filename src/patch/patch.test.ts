import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PatchValidator, parsePatch } from './PatchValidator';
import { BackupManager } from './BackupManager';
import { PatchApplier } from './PatchApplier';

test('PatchValidator: parses unified diff correctly', () => {
  const diff = `--- a/src/sample.ts
+++ b/src/sample.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 20;
 const c = 3;
`;
  const parsed = parsePatch(diff);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].oldPath, 'src/sample.ts');
  assert.strictEqual(parsed[0].hunks.length, 1);
  assert.strictEqual(parsed[0].hunks[0].oldStart, 1);
  assert.strictEqual(parsed[0].hunks[0].oldCount, 3);
  assert.strictEqual(parsed[0].hunks[0].lines.length, 4);
});

test('PatchValidator & PatchApplier & BackupManager: end-to-end safe application and rollback', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agcp-patch-test-'));
  const testFileRel = 'test.txt';
  const testFileAbs = path.join(tempDir, testFileRel);

  fs.writeFileSync(testFileAbs, 'line 1\nline 2\nline 3\n', 'utf8');

  try {
    const validator = new PatchValidator(tempDir);

    // 1. Valid patch
    const validDiff = `--- a/${testFileRel}
+++ b/${testFileRel}
@@ -1,3 +1,3 @@
 line 1
-line 2
+line two modified
 line 3
`;
    const valResult = validator.validate(validDiff);
    assert.strictEqual(valResult.valid, true, 'Patch should be valid');
    assert.strictEqual(valResult.errors.length, 0);

    // 2. Backup
    const backupMgr = new BackupManager(tempDir);
    const backupPath = backupMgr.createSnapshot(valResult.affectedFiles);
    assert.strictEqual(fs.existsSync(backupPath), true, 'Backup folder should exist');

    // 3. Apply
    const applier = new PatchApplier(tempDir);
    const modified = applier.apply(validDiff);
    assert.deepStrictEqual(modified, [testFileRel]);

    const updatedContent = fs.readFileSync(testFileAbs, 'utf8');
    assert.strictEqual(updatedContent, 'line 1\nline two modified\nline 3\n');

    // 4. Rollback
    const rollbackResult = backupMgr.restore(backupPath);
    assert.strictEqual(rollbackResult.success, true);

    const revertedContent = fs.readFileSync(testFileAbs, 'utf8');
    assert.strictEqual(revertedContent, 'line 1\nline 2\nline 3\n', 'File should be restored to original');

    // 5. Invalid patch detection (context mismatch)
    const mismatchedDiff = `--- a/${testFileRel}
+++ b/${testFileRel}
@@ -1,3 +1,3 @@
 line 1
-wrong content
+something else
 line 3
`;
    const invalidResult = validator.validate(mismatchedDiff);
    assert.strictEqual(invalidResult.valid, false, 'Validator should reject mismatched context');
    assert.ok(invalidResult.errors[0].includes('Context mismatch'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

