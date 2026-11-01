import test from 'node:test';
import assert from 'node:assert/strict';
import { executePlanPipeline } from './planContext';

test('executePlanPipeline: vague query with cursor returns exact line range and supporting types', () => {
  const plan = executePlanPipeline({
    query: 'this is not working can you resolve it',
    activeFile: 'src/graph/DependencyBuilder.ts',
    cursorLine: 44, // inside buildContext()
  });

  assert.equal(plan.status, 'matched');
  assert.equal(plan.action.type, 'fix');
  assert.ok(plan.target);
  assert.equal(plan.target?.name, 'buildContext');
  assert.equal(plan.target?.filePath, 'src/graph/DependencyBuilder.ts');

  // Verify line resolution pinned around line 44
  const targetRegion = plan.regions.find((r) => r.filePath.includes('DependencyBuilder.ts'));
  assert.ok(targetRegion);
  assert.ok(targetRegion.startLine <= 44);
  assert.ok(targetRegion.endLine >= 44);

  // Extracted code should be present and contain target function lines
  assert.ok(plan.code.includes('DependencyBuilder.ts'));
  assert.ok(plan.code.includes('fileId'));

  // Signal summary should report workspace activations
  assert.ok(plan.signalSummary.workspace > 0);
});

test('executePlanPipeline: exact symbol query returns high-confidence plan', () => {
  const plan = executePlanPipeline({
    query: 'explain how extractCodeForNode works',
  });

  assert.equal(plan.status, 'matched');
  assert.equal(plan.action.type, 'explain');
  assert.ok(plan.target);
  assert.equal(plan.target?.name, 'extractCodeForNode');
  assert.ok(plan.target?.filePath.includes('ContextExtractor.ts'));
  assert.ok(plan.target?.confidence >= 0.90);
  assert.ok(plan.code.includes('extractCodeForNode'));
});

test('executePlanPipeline: vague query with zero context returns insufficient_evidence', () => {
  const plan = executePlanPipeline({
    query: 'something is broken, fix it please',
  });

  assert.equal(plan.status, 'insufficient_evidence');
  assert.equal(plan.target, null);
  assert.equal(plan.regions.length, 0);
});

