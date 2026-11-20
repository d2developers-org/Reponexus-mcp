import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  CodeGraph,
  splitKeywords,
  inferBehaviorTags,
  extractErrorPatterns,
  extractIdentifiers,
} from '../src/graph/CodeGraph';
import { SAGEGraph } from '../src/graph/types';

test('splitKeywords correctly splits camelCase, snake_case and paths', () => {
  const keywords = splitKeywords('src/auth/AuthService.ts');
  assert.ok(keywords.includes('src'));
  assert.ok(keywords.includes('auth'));
  assert.ok(keywords.includes('service'));

  const camelKeywords = splitKeywords('calculateTotalPrice');
  assert.deepEqual(camelKeywords, ['calculate', 'total', 'price']);
});

test('extractIdentifiers extracts valid code tokens', () => {
  const code = `
    const user = await getUser(userId);
    if (!user) throw new Error("User not found");
    return user.role;
  `;
  const ids = extractIdentifiers(code);
  assert.ok(ids.includes('user'));
  assert.ok(ids.includes('getUser'));
  assert.ok(ids.includes('userId'));
  assert.ok(ids.includes('role'));
  assert.ok(!ids.includes('const'));
  assert.ok(!ids.includes('return'));
});

test('extractErrorPatterns extracts throw expressions and Error messages', () => {
  const code = `
    if (!token) throw new AuthError("JWT expired");
    try {
      doSomething();
    } catch (err: CustomException) {
      console.error(err);
    }
  `;
  const patterns = extractErrorPatterns(code);
  assert.ok(patterns.includes('AuthError'));
  assert.ok(patterns.includes('JWT expired'));
  assert.ok(patterns.includes('CustomException'));
});

test('inferBehaviorTags assigns deterministic tags based on code signals', () => {
  const authTags = inferBehaviorTags(
    'verifyToken',
    'src/auth/AuthService.ts',
    'const token = req.headers.authorization; if (!token) throw new Error("Invalid token");',
    ['token', 'verifyToken', 'req']
  );
  assert.ok(authTags.includes('auth'));
  assert.ok(authTags.includes('error-handling'));
  assert.ok(authTags.includes('validation'));

  const renderTags = inferBehaviorTags(
    'LoginScreen',
    'src/components/LoginScreen.tsx',
    'return <View><Text>Login</Text></View>;',
    ['View', 'Text', 'LoginScreen']
  );
  assert.ok(renderTags.includes('rendering'));
});

test('CodeGraph builds multi-resolution graph with file, symbol, and block nodes', () => {
  const root = process.cwd();
  const graph: SAGEGraph = CodeGraph.build(root);

  assert.ok(graph.nodes.length > 0, 'Graph should have nodes');
  assert.ok(graph.edges.length > 0, 'Graph should have edges');

  const fileNodes = graph.nodes.filter((n) => n.level === 'file');
  const symbolNodes = graph.nodes.filter((n) => n.level === 'symbol');
  const blockNodes = graph.nodes.filter((n) => n.level === 'block');

  assert.ok(fileNodes.length > 0, 'Should have file nodes');
  assert.ok(symbolNodes.length > 0, 'Should have symbol nodes');
  assert.ok(blockNodes.length > 0, 'Should have block nodes');

  // Verify node structure & line numbers
  for (const node of graph.nodes) {
    assert.ok(node.id, `Node must have an id: ${JSON.stringify(node)}`);
    assert.ok(node.filePath, `Node must have a filePath: ${node.id}`);
    assert.ok(node.startLine >= 1, `startLine must be >= 1: ${node.id} (${node.startLine})`);
    assert.ok(node.endLine >= node.startLine, `endLine must be >= startLine: ${node.id}`);
    assert.ok(node.annotation, `Node must have an annotation object: ${node.id}`);
    assert.ok(Array.isArray(node.annotation.keywords), 'Keywords must be an array');
    assert.ok(Array.isArray(node.annotation.identifiers), 'Identifiers must be an array');
    assert.ok(Array.isArray(node.annotation.behaviorTags), 'BehaviorTags must be an array');
  }

  // Verify block nodes have parentId and blockType
  for (const block of blockNodes) {
    assert.ok(block.blockType, `Block node must have blockType: ${block.id}`);
    assert.ok(block.parentId, `Block node must have a parentId: ${block.id}`);
  }

  // Verify CALLED_BY is exact reverse of CALLS
  const callsEdges = graph.edges.filter((e) => e.relation === 'CALLS');
  const calledByEdges = graph.edges.filter((e) => e.relation === 'CALLED_BY');
  assert.equal(
    callsEdges.length,
    calledByEdges.length,
    'CALLED_BY edge count should match CALLS edge count'
  );

  const calledByKeySet = new Set(calledByEdges.map((e) => `${e.sourceId}->${e.targetId}`));
  for (const call of callsEdges) {
    assert.ok(
      calledByKeySet.has(`${call.targetId}->${call.sourceId}`),
      `CALLED_BY edge missing for call ${call.sourceId} -> ${call.targetId}`
    );
  }

  // Verify persistence produces valid file
  const testOutputPath = path.join(root, 'data', 'test-sage-graph.json');
  CodeGraph.buildAndPersist(root, testOutputPath);
  assert.ok(fs.existsSync(testOutputPath));
  const loaded = JSON.parse(fs.readFileSync(testOutputPath, 'utf8'));
  assert.equal(loaded.nodes.length, graph.nodes.length);
  fs.unlinkSync(testOutputPath);
});

