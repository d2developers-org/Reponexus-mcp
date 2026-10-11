import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphData } from './types';
import { MinimalContextGenerator } from './MinimalContextGenerator';
import { DependencyBuilder } from './DependencyBuilder';

function main() {
  const graphPath = path.join(process.cwd(), 'data', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    console.error('Graph data not found. Please run "npm run convert" first.');
    process.exitCode = 1;
    return;
  }

  const graphData: GraphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const generator = new MinimalContextGenerator(process.cwd(), graphData);
  const depBuilder = new DependencyBuilder(graphData);

  // Find a target node with dependencies to simulate a real scenario
  let targetNode = graphData.nodes.find(n => 
    (n.type === 'FUNCTION' || n.type === 'METHOD') && 
    graphData.edges.some(e => e.sourceId === n.id && e.relation === 'CALLS')
  );
  
  if (!targetNode) {
    targetNode = graphData.nodes.find(n => n.type === 'FUNCTION' || n.type === 'METHOD');
  }

  if (!targetNode) {
    console.error('No suitable nodes found.');
    return;
  }

  // Find dependencies to bundle with the target node
  const contextDeps = depBuilder.buildContext(targetNode.id);
  
  // Combine target + references (duplicates will be handled by the generator)
  const idsToExtract = [
    targetNode.id,
    targetNode.id, // Intentional duplicate to test deduplication
    ...contextDeps.references.map(n => n.id)
  ];

  console.log(`[Minimal Context Generator Test]`);
  console.log(`Generating package for: ${targetNode.name} + its references`);
  console.log('-'.repeat(40));
  
  const finalContext = generator.generate(idsToExtract);
  
  console.log(JSON.stringify(finalContext, null, 2));
  console.log('-'.repeat(40));
}

if (require.main === module) {
  main();
}
