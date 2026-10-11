import * as fs from 'node:fs';
import * as path from 'node:path';
import { ASTConverter } from './ASTConverter';
import { StandardizedOutput } from '../ast/types';

function main() {
  const inputPath = path.join(process.cwd(), 'data', 'output.json');
  const outputPath = path.join(process.cwd(), 'data', 'graph.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`AST output not found at ${inputPath}. Please run 'npm run index' first.`);
    process.exitCode = 1;
    return;
  }

  const astOutput: StandardizedOutput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  console.log(`Loaded AST with ${astOutput.files.length} files, ${astOutput.symbols.length} symbols, and ${astOutput.relationships.length} relationships.`);
  
  const graphData = ASTConverter.convert(astOutput);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(graphData, null, 2)}\n`, 'utf8');

  console.log(
    `Successfully converted to Graph Data: ${graphData.nodes.length} nodes and ` +
    `${graphData.edges.length} edges.`
  );
  console.log(`Saved graph data to ${outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Graph conversion failed:', error);
    process.exitCode = 1;
  }
}
