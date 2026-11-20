import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TargetResolver } from '../src/graph/TargetResolver';
import { WorkspaceSignal } from '../src/graph/signals/WorkspaceSignal';
import { QuerySignal } from '../src/graph/signals/QuerySignal';
import { ErrorSignal } from '../src/graph/signals/ErrorSignal';
import { SAGEGraph } from '../src/graph/types';

function loadTestGraph(): SAGEGraph {
  const graphPath = path.join(process.cwd(), 'data', 'sage-graph.json');
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
}

test('TargetResolver resolves exact symbol name (P2) with high confidence', () => {
  const graph = loadTestGraph();
  const input = { query: 'Find buildContext function' };
  const activations = new QuerySignal().collect(input, graph);

  const resolution = TargetResolver.resolve(input, graph, activations);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets.length, 1);
  assert.equal(resolution.targets[0].name, 'buildContext');
  assert.equal(resolution.targets[0].matchPriority, 2);
  assert.ok(resolution.targets[0].confidence >= 0.90);
});

test('TargetResolver disambiguates identical symbol names using file constraint in query', () => {
  const graph = loadTestGraph();
  // Requesting extractCodeForNode explicitly in ContextExtractor.ts
  const input = { query: 'extractCodeForNode in ContextExtractor.ts' };
  const activations = new QuerySignal().collect(input, graph);

  const resolution = TargetResolver.resolve(input, graph, activations);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets[0].name, 'extractCodeForNode');
  assert.ok(resolution.targets[0].filePath.includes('ContextExtractor.ts'));
});

test('TargetResolver resolves vague query using workspace cursor location (P5)', () => {
  const graph = loadTestGraph();
  const input = {
    query: 'this is not working can you fix it',
    activeFile: 'src/graph/DependencyBuilder.ts',
    cursorLine: 44, // inside buildContext()
  };

  const wsActs = new WorkspaceSignal().collect(input, graph);
  const qActs = new QuerySignal().collect(input, graph);
  const allActs = [...wsActs, ...qActs];

  const resolution = TargetResolver.resolve(input, graph, allActs);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets[0].name, 'buildContext');
  assert.equal(resolution.targets[0].matchPriority, 5);
  assert.ok(resolution.targets[0].confidence >= 0.80);
});

test('TargetResolver resolves crash site from error stack frame (P4)', () => {
  const graph = loadTestGraph();
  const input = {
    query: 'why is it crashing',
    errors: 'Error: Node missing\n    at buildContext (src/graph/DependencyBuilder.ts:40:5)',
  };

  const errActs = new ErrorSignal().collect(input, graph);
  const qActs = new QuerySignal().collect(input, graph);
  const allActs = [...errActs, ...qActs];

  const resolution = TargetResolver.resolve(input, graph, allActs);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets[0].name, 'buildContext');
  assert.equal(resolution.targets[0].matchPriority, 4);
});

test('TargetResolver honestly returns insufficient_evidence when no context or matches exist', () => {
  const graph = loadTestGraph();
  const input = { query: 'something is broken please fix it' };
  const activations = new QuerySignal().collect(input, graph);

  const resolution = TargetResolver.resolve(input, graph, activations);
  assert.equal(resolution.status, 'insufficient_evidence');
  assert.equal(resolution.targets.length, 0);
});

