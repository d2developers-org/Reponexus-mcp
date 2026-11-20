import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ActivationEngine } from '../src/graph/ActivationEngine';
import { TargetResolver } from '../src/graph/TargetResolver';
import { WorkspaceSignal } from '../src/graph/signals/WorkspaceSignal';
import { QuerySignal } from '../src/graph/signals/QuerySignal';
import { SAGEGraph, SAGENode, GraphEdge, Activation } from '../src/graph/types';

function loadTestGraph(): SAGEGraph {
  const graphPath = path.join(process.cwd(), 'data', 'sage-graph.json');
  return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
}

test('ActivationEngine: cycle safety - mutual recursion does not produce scores > 1.0', () => {
  // Construct a synthetic cyclic graph
  const nodeA: SAGENode = {
    id: 'sym:funcA',
    type: 'FUNCTION',
    name: 'funcA',
    filePath: 'test.ts',
    startLine: 1,
    endLine: 10,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };
  const nodeB: SAGENode = {
    id: 'sym:funcB',
    type: 'FUNCTION',
    name: 'funcB',
    filePath: 'test.ts',
    startLine: 12,
    endLine: 20,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };

  const edges: GraphEdge[] = [
    { sourceId: 'sym:funcA', targetId: 'sym:funcB', relation: 'CALLS' },
    { sourceId: 'sym:funcB', targetId: 'sym:funcA', relation: 'CALLS' },
  ];

  const syntheticGraph: SAGEGraph = {
    nodes: [nodeA, nodeB],
    edges,
  };

  const engine = new ActivationEngine({ maxHops: 5 });
  const activations: Activation[] = [
    { nodeId: 'sym:funcA', score: 1.0, source: 'query', reason: 'Initial seed' },
  ];

  const results = engine.activate(syntheticGraph, activations);

  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(r.score <= 1.0, `Score for ${r.node.name} must never exceed 1.0, got ${r.score}`);
    assert.ok(r.score >= 0.0, `Score must be positive`);
  }

  // funcA was seeded with 1.0, funcB received 1.0 * 0.70 = 0.70
  const scoreA = results.find((r) => r.node.id === 'sym:funcA')?.score;
  const scoreB = results.find((r) => r.node.id === 'sym:funcB')?.score;
  assert.equal(scoreA, 1.0);
  assert.equal(scoreB, 0.70);
});

test('ActivationEngine: sibling isolation - method activation does not auto-activate sibling methods', () => {
  // Construct synthetic class with two methods
  const classNode: SAGENode = {
    id: 'class:MyService',
    type: 'CLASS',
    name: 'MyService',
    filePath: 'service.ts',
    startLine: 1,
    endLine: 50,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };
  const method1: SAGENode = {
    id: 'method:targetMethod',
    type: 'METHOD',
    name: 'targetMethod',
    filePath: 'service.ts',
    startLine: 5,
    endLine: 20,
    level: 'symbol',
    parentId: 'class:MyService',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };
  const method2: SAGENode = {
    id: 'method:unrelatedSibling',
    type: 'METHOD',
    name: 'unrelatedSibling',
    filePath: 'service.ts',
    startLine: 22,
    endLine: 45,
    level: 'symbol',
    parentId: 'class:MyService',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };

  const edges: GraphEdge[] = [
    { sourceId: 'class:MyService', targetId: 'method:targetMethod', relation: 'CONTAINS' },
    { sourceId: 'class:MyService', targetId: 'method:unrelatedSibling', relation: 'CONTAINS' },
  ];

  const syntheticGraph: SAGEGraph = {
    nodes: [classNode, method1, method2],
    edges,
  };

  const engine = new ActivationEngine();
  const activations: Activation[] = [
    { nodeId: 'method:targetMethod', score: 1.0, source: 'workspace', reason: 'Cursor inside target' },
  ];

  const results = engine.activate(syntheticGraph, activations);

  const activatedIds = new Set(results.map((r) => r.node.id));

  // method1 should be active
  assert.ok(activatedIds.has('method:targetMethod'));
  // classNode should be active as enclosing parent context
  assert.ok(activatedIds.has('class:MyService'));
  // sibling method2 must NOT be activated!
  assert.ok(!activatedIds.has('method:unrelatedSibling'), 'Sibling method must not be activated!');
});

test('ActivationEngine: multi-signal merge compounds score with bounded bonus', () => {
  const node: SAGENode = {
    id: 'sym:testNode',
    type: 'FUNCTION',
    name: 'testFunc',
    filePath: 'test.ts',
    startLine: 1,
    endLine: 10,
    level: 'symbol',
    annotation: { identifiers: [], errorPatterns: [], behaviorTags: [], keywords: [] },
  };

  const engine = new ActivationEngine({ multiSignalBonus: 0.15 });
  const activations: Activation[] = [
    { nodeId: 'sym:testNode', score: 0.80, source: 'workspace', reason: 'Active in editor' },
    { nodeId: 'sym:testNode', score: 0.70, source: 'query', reason: 'Matched keyword' },
  ];

  const results = engine.activate({ nodes: [node], edges: [] }, activations);
  assert.equal(results.length, 1);
  // Expected: 0.80 + 0.15 * 0.70 = 0.905
  assert.ok(results[0].score > 0.80);
  assert.ok(results[0].score <= 1.0);
  assert.equal(results[0].sources.length, 2);
});

test('ActivationEngine + TargetResolver: vague query with cursor on real repository graph', () => {
  const graph = loadTestGraph();
  const input = {
    query: 'this is not working can you resolve it',
    activeFile: 'src/graph/DependencyBuilder.ts',
    cursorLine: 44, // inside buildContext()
  };

  const wsActs = new WorkspaceSignal().collect(input, graph);
  const qActs = new QuerySignal().collect(input, graph);
  const allActs = [...wsActs, ...qActs];

  const resolution = TargetResolver.resolve(input, graph, allActs);
  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets[0].name, 'buildContext');

  const engine = new ActivationEngine();
  const results = engine.activate(graph, allActs, resolution);

  // Top result must be buildContext
  assert.equal(results[0].node.name, 'buildContext');
  assert.equal(results[0].score, 1.0);

  // Must include enclosing class and referenced types
  const names = results.map((r) => r.node.name);
  assert.ok(names.includes('DependencyBuilder'));
});

