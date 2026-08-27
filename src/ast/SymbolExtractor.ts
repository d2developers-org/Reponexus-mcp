import { SourceFile } from "ts-morph";
import * as path from "path";
import { ExtractedSymbol } from "./types";

export class SymbolExtractor {
  
  /**
   * Extracts all symbols (classes, methods, functions, interfaces) from a SourceFile.
   */
  public static extractFrom(sourceFile: SourceFile): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const filePath = sourceFile.getFilePath();
    // Safely get relative path across OS environments (handling slash differences)
    let relativeFilePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    if (relativeFilePath.startsWith('..')) relativeFilePath = filePath;

    // 1. Extract Interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const intf of interfaces) {
      symbols.push({
        type: 'interface',
        name: intf.getName(),
        file: relativeFilePath,
        startLine: intf.getStartLineNumber(),
        endLine: intf.getEndLineNumber()
      });
    }

    // 2. Extract Classes & their Methods
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const className = cls.getName() || "AnonymousClass";
      
      symbols.push({
        type: 'class',
        name: className,
        file: relativeFilePath,
        startLine: cls.getStartLineNumber(),
        endLine: cls.getEndLineNumber()
      });

      // Extract Methods
      const methods = cls.getMethods();
      for (const method of methods) {
        symbols.push({
          type: 'method',
          name: method.getName(),
          file: relativeFilePath,
          startLine: method.getStartLineNumber(),
          endLine: method.getEndLineNumber(),
          parameters: method.getParameters().map(p => p.getName()),
          returnType: method.getReturnType().getText()
        });
      }
    }

    // 3. Extract independent Functions
    const functions = sourceFile.getFunctions();
    for (const func of functions) {
      const funcName = func.getName() || "AnonymousFunction";
      symbols.push({
        type: 'function',
        name: funcName,
        file: relativeFilePath,
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
        parameters: func.getParameters().map(p => p.getName()),
        returnType: func.getReturnType().getText()
      });
    }

    return symbols;
  }
}
