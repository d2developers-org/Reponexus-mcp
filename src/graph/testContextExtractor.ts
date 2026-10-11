import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphData } from './types';
import { ContextExtractor } from './ContextExtractor';

function main() {
  const graphPath = path.join(process.cwd(), 'data', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    console.error('Graph data not found. Please run "npm run convert" first.');
    process.exitCode = 1;
    return;
  }

  const graphData: GraphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const extractor = new ContextExtractor(process.cwd(), graphData);

  // Find a test node (preferably a function or method)
  const targetNode = graphData.nodes.find(n => n.type === 'FUNCTION' || n.type === 'METHOD');
  if (!targetNode) {
    console.error('No function or method nodes found in the graph data.');
    return;
  }

  console.log(`[Context Extractor Test]`);
  console.log(`Target: ${targetNode.type} '${targetNode.name}' (ID: ${targetNode.id})`);
  console.log(`Location: ${targetNode.filePath}, Lines: ${targetNode.startLine}-${targetNode.endLine}`);
  console.log('-'.repeat(40));
  
  const code = extractor.extractCodeForNode(targetNode);
  console.log(code);
  
  console.log('-'.repeat(40));
}

if (require.main === module) {
  main();
}
