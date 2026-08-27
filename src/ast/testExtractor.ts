import { Project } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { SymbolExtractor } from "./SymbolExtractor";
import { RelationshipExtractor } from "./RelationshipExtractor";
import { StandardizedOutput } from "./types";

function testExtraction() {
  const project = new Project();
  // Using process.cwd() ensures it works when run from the root directory
  const sampleFilePath = path.join(process.cwd(), "learn-ts-morph/sample.ts");
  
  if (!fs.existsSync(sampleFilePath)) {
    console.error(`Sample file not found at: ${sampleFilePath}`);
    return;
  }

  const sourceFile = project.addSourceFileAtPath(sampleFilePath);
  
  console.log("Extracting symbols...");
  const symbols = SymbolExtractor.extractFrom(sourceFile);

  console.log("Extracting relationships...");
  const relationships = RelationshipExtractor.extractFrom(sourceFile);

  // Format as standardized output for Developer 2
  let relativeFilePath = path.relative(process.cwd(), sourceFile.getFilePath()).replace(/\\/g, '/');
  if (relativeFilePath.startsWith('..')) relativeFilePath = sourceFile.getFilePath();

  const outputData: StandardizedOutput = {
    files: [relativeFilePath],
    symbols: symbols,
    relationships: relationships
  };

  // Write to data/output.json
  const outPath = path.join(process.cwd(), "data/output.json");
  
  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2));
  console.log(`✅ Extracted ${symbols.length} symbols!`);
  console.log(`✅ Extracted ${relationships.length} relationships!`);
  console.log(`✅ Saved fully structured AST Graph to: data/output.json`);
}

testExtraction();
