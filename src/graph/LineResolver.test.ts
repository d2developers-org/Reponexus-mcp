import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { LineResolver } from './LineResolver';
import { ActivatedNodeResult } from './ActivationEngine';
import { SAGEGraph, SAGENode } from './types';

function loadTestGraph(): SAGEGraph {
  const graphPath = path.join(process.cwd(), 'data', 'sage-graph.json');
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
}

test('LineResolver pins to cursor line with context window', () => {
  const graph = loadTestGraph();
  const repoRoot = process.cwd();
  const resolver = new LineResolver(repoRoot, { contextWindowLines: 5 });

  const buildContextNode = graph.nodes.find(
    (n) => n.name === 'buildContext' && n.filePath.includes('DependencyBuilder.ts')
  )!;
  assert.ok(buildContextNode);

  const activated: ActivatedNodeResult[] = [
    {
      node: buildContextNode,
      score: 1.0,
      reasons: ['Cursor on line 44'],
      sources: ['workspace'],
    },
  ];

  const input = {
    query: 'fix this line',
    activeFile: 'src/graph/DependencyBuilder.ts',
    cursorLine: 44,
  };

  const regions = resolver.resolve(activated, input, graph);
  assert.equal(regions.length, 1);
  const r = regions[0];
  assert.equal(r.filePath, buildContextNode.filePath);
  // Expected: 44 - 5 = 39, 44 + 5 = 49
  assert.equal(r.startLine, 39);
  assert.equal(r.endLine, 49);
  assert.ok(r.reasons.some((reason) => reason.includes('Pinned to workspace cursor line 44')));
});

test('LineResolver pins to error crash frame line', () => {
  const graph = loadTestGraph();
  const repoRoot = process.cwd();
  const resolver = new LineResolver(repoRoot, { contextWindowLines: 5 });

  const buildContextNode = graph.nodes.find(
    (n) => n.name === 'buildContext' && n.filePath.includes('DependencyBuilder.ts')
  )!;

  const activated: ActivatedNodeResult[] = [
    {
      node: buildContextNode,
      score: 0.95,
      reasons: ['Error stack frame'],
      sources: ['error'],
    },
  ];

  const input = {
    query: 'fix crash',
    errors: 'Error: Cannot read\n    at buildContext (DependencyBuilder.ts:50:10)',
  };

  const regions = resolver.resolve(activated, input, graph);
  assert.equal(regions.length, 1);
  const r = regions[0];
  // Pinned around 50: 50 - 5 = 45, 50 + 5 = 55
  assert.equal(r.startLine, 45);
  assert.equal(r.endLine, 55);
  assert.ok(r.reasons.some((reason) => reason.includes('Pinned to crash frame line 50')));
});

test('LineResolver merges overlapping line ranges within same file', () => {
  const repoRoot = process.cwd();
  const resolver = new LineResolver(repoRoot);

  const nodeA: SAGENode = {
    id: 'sym:partA',
    type: 'METHOD',
    name: 'partA',
    filePath: 'sample.ts',
    startLine: 10,
    endLine: 25,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };

  const nodeB: SAGENode = {
    id: 'sym:partB',
    type: 'METHOD',
    name: 'partB',
    filePath: 'sample.ts',
    startLine: 20,
    endLine: 35,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };

  const activated: ActivatedNodeResult[] = [
    { node: nodeA, score: 0.9, reasons: ['Reason A'], sources: ['query'] },
    { node: nodeB, score: 0.8, reasons: ['Reason B'], sources: ['query'] },
  ];

  const regions = resolver.resolve(activated, { query: 'test' }, { nodes: [nodeA, nodeB], edges: [] });
  assert.equal(regions.length, 1, 'Overlapping regions in sample.ts should be merged into 1');
  assert.equal(regions[0].startLine, 10);
  assert.equal(regions[0].endLine, 35);
  assert.equal(regions[0].activationScore, 0.9);
});

