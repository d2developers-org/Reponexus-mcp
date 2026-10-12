import * as fs from 'node:fs';
import * as path from 'node:path';
import { QueryAnalyzer } from './QueryAnalyzer';
import { GraphData } from './types';

// 1. Load the generated repository graph
const graphPath = path.join(process.cwd(), 'data', 'graph.json');
let graphData: GraphData | undefined;

if (fs.existsSync(graphPath)) {
  const raw = fs.readFileSync(graphPath, 'utf8');
  graphData = JSON.parse(raw) as GraphData;
  console.log(`Loaded ${graphData.nodes.length} nodes from ${graphPath}`);
} else {
  console.warn(`Warning: data/graph.json not found, testing without graph symbol matching.`);
}

const analyzer = new QueryAnalyzer(graphData);

// 2. Test queries covering all main intents and operations
const testQueries = [
  'Replace JWT with Clerk in AuthService',
  'Fix the login error in sample.ts',
  'Implement new rateLimiter for API',
  'Refactor verifyCredentials in AuthService',
  'Explain how TreeSitterExtractor parses classes'
];

console.log('\n========================================');
console.log('   DAY 1: QUERY ANALYZER TEST SUITE    ');
console.log('========================================\n');

for (const query of testQueries) {
  console.log(`----------------------------------------`);
  console.log(`Query: "${query}"`);
  
  const result = analyzer.analyzeQuery({ query });

  console.log(`Intent:      [${result.intent.toUpperCase()}]`);
  console.log(`Operations: `, JSON.stringify(result.operations));
  console.log(`Keywords:   `, result.extractedKeywords);
  console.log(`Matched Symbols (${result.targetSymbols.length} found):`);
  
  // Show top 3 matched symbols
  for (const sym of result.targetSymbols.slice(0, 3)) {
    console.log(`  - [${sym.type}] ${sym.name} (${sym.filePath}) | confidence: ${sym.confidence} (${sym.matchType})`);
  }
}

console.log('\n========================================');
console.log('Day 1 QueryAnalyzer test completed successfully!');
console.log('========================================\n');
