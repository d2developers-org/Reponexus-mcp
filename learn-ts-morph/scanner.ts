import { Project } from "ts-morph";
import * as path from "path";

// 1. Initialize a new ts-morph Project
const project = new Project();

// 2. Add our sample file to the project
const sampleFilePath = path.join(__dirname, "sample.ts");
const sourceFile = project.addSourceFileAtPath(sampleFilePath);

console.log(`\n🔍 Scanning File: ${sourceFile.getBaseName()}\n`);

// 3. Find and list all Imports
console.log("--- Imports ---");
const imports = sourceFile.getImportDeclarations();
imports.forEach(imp => {
  console.log(`- Imports from: '${imp.getModuleSpecifierValue()}'`);
});

// 4. Find and list all Interfaces
console.log("\n--- Interfaces ---");
const interfaces = sourceFile.getInterfaces();
interfaces.forEach(intf => {
  console.log(`- Interface: ${intf.getName()} (Lines: ${intf.getStartLineNumber()} to ${intf.getEndLineNumber()})`);
});

// 5. Find and list all Classes & Methods
console.log("\n--- Classes & Methods ---");
const classes = sourceFile.getClasses();
classes.forEach(cls => {
  console.log(`- Class: ${cls.getName()} (Lines: ${cls.getStartLineNumber()} to ${cls.getEndLineNumber()})`);

  // Get methods inside the class
  const methods = cls.getMethods();
  methods.forEach(method => {
    console.log(`  -> Method: ${method.getName()} (Lines: ${method.getStartLineNumber()} to ${method.getEndLineNumber()})`);
  });
});

// 6. Find and list all independent Functions
console.log("\n--- Functions ---");
const functions = sourceFile.getFunctions();
functions.forEach(func => {
  console.log(`- Function: ${func.getName()} (Lines: ${func.getStartLineNumber()} to ${func.getEndLineNumber()})`);
});

// 7. Find and list all Exports
console.log("\n--- Exports ---");
const exportss = sourceFile.getExportedDeclarations();
for (const [name, declarations] of exportss) {
  console.log(`- Exported: ${name}`);
}

console.log("\n✅ Scan Complete!\n");
