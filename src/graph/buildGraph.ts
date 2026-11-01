import * as path from 'node:path';
import { CodeGraph } from './CodeGraph';

function main(): void {
  const repositoryPath = process.argv[2] ?? process.cwd();
  const root = path.resolve(repositoryPath);
  const outputPath = path.join(root, 'data', 'sage-graph.json');

  console.log(`[SAGE] Building Multi-Resolution Code Graph for: ${root}`);
  const startTime = Date.now();

  const graph = CodeGraph.buildAndPersist(root, outputPath);

  const duration = Date.now() - startTime;

  // Breakdown statistics
  const levelCounts: Record<string, number> = { file: 0, symbol: 0, block: 0 };
  for (const node of graph.nodes) {
    levelCounts[node.level] = (levelCounts[node.level] || 0) + 1;
  }

  const relationCounts: Record<string, number> = {};
  for (const edge of graph.edges) {
    relationCounts[edge.relation] = (relationCounts[edge.relation] || 0) + 1;
  }

  console.log(`[SAGE] Graph successfully generated in ${duration}ms!`);
  console.log(`  Total Nodes: ${graph.nodes.length}`);
  console.log(`    - Files:   ${levelCounts.file}`);
  console.log(`    - Symbols: ${levelCounts.symbol}`);
  console.log(`    - Blocks:  ${levelCounts.block}`);
  console.log(`  Total Edges: ${graph.edges.length}`);
  for (const [rel, count] of Object.entries(relationCounts).sort()) {
    console.log(`    - ${rel}: ${count}`);
  }
  console.log(`  Saved to: ${outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[SAGE] Graph build failed:', error);
    process.exitCode = 1;
  }
}

