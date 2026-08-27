import { SourceFile, SyntaxKind } from "ts-morph";
import * as path from "path";
import { ExtractedRelationship } from "./types";

export class RelationshipExtractor {
  
  /**
   * Extracts relationships (IMPORTS, CONTAINS, CALLS) from a SourceFile.
   */
  public static extractFrom(sourceFile: SourceFile): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const filePath = sourceFile.getFilePath();
    // Safely get relative path across OS environments
    let relativeFilePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    if (relativeFilePath.startsWith('..')) relativeFilePath = filePath;

    // 1. Extract IMPORTS
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      relationships.push({
        from: relativeFilePath,
        to: moduleSpecifier, // We'll just link to the import string for now
        relation: 'IMPORTS'
      });
    }

    // 2. Extract CONTAINS (File -> Classes, File -> Functions, File -> Interfaces)
    
    // Classes & Methods
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName();
      if (!className) continue;

      relationships.push({
        from: relativeFilePath,
        to: className,
        relation: 'CONTAINS'
      });

      for (const method of cls.getMethods()) {
        const methodName = method.getName();
        relationships.push({
          from: className,
          to: methodName,
          relation: 'CONTAINS'
        });

        // 3. Extract CALLS (Inside methods)
        // We'll look for CallExpressions inside the method's body
        const callExpressions = method.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const callExpr of callExpressions) {
          const expression = callExpr.getExpression();
          let calledName = expression.getText();
          // E.g., 'this.verifyCredentials' -> 'verifyCredentials'
          if (calledName.includes('.')) {
            calledName = calledName.split('.').pop() || calledName;
          }
          if (calledName !== 'console' && calledName !== 'log') { // ignore console logs
            relationships.push({
              from: methodName,
              to: calledName,
              relation: 'CALLS'
            });
          }
        }
      }
    }

    // Functions
    for (const func of sourceFile.getFunctions()) {
      const funcName = func.getName();
      if (!funcName) continue;

      relationships.push({
        from: relativeFilePath,
        to: funcName,
        relation: 'CONTAINS'
      });

      // Extract CALLS inside functions
      const callExpressions = func.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const callExpr of callExpressions) {
        const expression = callExpr.getExpression();
        let calledName = expression.getText();
        if (calledName.includes('.')) {
          calledName = calledName.split('.').pop() || calledName;
        }
        if (calledName !== 'console' && calledName !== 'log') {
          relationships.push({
            from: funcName,
            to: calledName,
            relation: 'CALLS'
          });
        }
      }
    }

    // Interfaces
    for (const intf of sourceFile.getInterfaces()) {
      const intfName = intf.getName();
      relationships.push({
        from: relativeFilePath,
        to: intfName,
        relation: 'CONTAINS'
      });
    }

    return relationships;
  }
}
