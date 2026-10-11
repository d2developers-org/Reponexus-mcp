import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphData } from './types';
import { DependencyBuilder } from './DependencyBuilder';

function main() {
  const graphPath = path.join(process.cwd(), 'data', 'graph.json');
  if (!fs.existsSync(graphPath)) {
    console.error('Graph data not found. Please run "npm run convert" first.');
    process.exitCode = 1;
    return;
  }

  const graphData: GraphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const builder = new DependencyBuilder(graphData);

  // Pick a target node that has CALLS relationships to show references, if possible
  let targetNode = graphData.nodes.find(n => 
    (n.type === 'FUNCTION' || n.type === 'METHOD') && 
    graphData.edges.some(e => e.sourceId === n.id && e.relation === 'CALLS')
  );
  
  if (!targetNode) {
    targetNode = graphData.nodes.find(n => n.type === 'FUNCTION' || n.type === 'METHOD');
  }

  if (!targetNode) {
    console.error('No suitable function or method nodes found in the graph data.');
    return;
  }

  console.log(`[Dependency Builder Test]`);
  console.log(`Building context for ${targetNode.type} '${targetNode.name}' (ID: ${targetNode.id})`);
  console.log('-'.repeat(40));
  
  const context = builder.buildContext(targetNode.id);
  
  // Format the output
  const output = {
    imports: context.imports.map(n => n.name),
    references: context.references.map(n => n.name),
    related: context.related.map(n => n.name)
  };
  
  console.log(JSON.stringify(output, null, 2));
  console.log('-'.repeat(40));
}

if (require.main === module) {
  main();
}
