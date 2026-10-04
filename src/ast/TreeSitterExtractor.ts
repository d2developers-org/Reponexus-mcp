import Parser = require('tree-sitter');
import {
  ExtractedRelationship,
  ExtractedSymbol,
  StandardizedOutput,
  SymbolType,
  SupportedLanguage,
} from './types';
import { LanguageDefinition } from './TreeSitterLanguage';

interface GrammarModule {
  typescript?: object;
  tsx?: object;
  default?: object;
}

const identifierTypes = new Set([
  'identifier',
  'type_identifier',
  'field_identifier',
  'property_identifier',
  'shorthand_property_identifier',
]);

const classTypes = new Set([
  'class',
  'class_declaration',
  'class_definition',
  'class_specifier',
  'struct_specifier',
  'impl_item',
]);

export class TreeSitterExtractor {
  public static extractFrom(
    source: string,
    file: string,
    definition: LanguageDefinition,
  ): StandardizedOutput {
    const parser = new Parser();
    const grammarPackage = require(definition.grammarPackage) as GrammarModule;
    const grammar = this.getGrammar(grammarPackage, definition.language, file);
    parser.setLanguage(grammar);

    const tree = parser.parse(source);
    const fileId = `file:${file}`;
    const lineCount = source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length;
    const fileSymbol: ExtractedSymbol = {
      id: fileId,
      type: 'file',
      name: file,
      file,
      language: definition.language,
      startLine: 1,
      endLine: lineCount,
    };
    const symbols: ExtractedSymbol[] = [fileSymbol];
    const relationships: ExtractedRelationship[] = [];
    const referenceSymbols = new Map<string, ExtractedSymbol>();

    const visit = (node: Parser.SyntaxNode, containingSymbol: ExtractedSymbol): void => {
      let currentContainer = containingSymbol;
      const symbolType = definition.declarations[node.type];

      if (symbolType) {
        const name = this.getNodeName(node);
        if (name) {
          const type = this.refineSymbolType(node, symbolType);
          const symbol = this.createSymbol(node, file, definition.language, type, name);
          symbols.push(symbol);
          relationships.push({
            fromId: containingSymbol.id,
            toId: symbol.id,
            from: containingSymbol.name,
            to: symbol.name,
            relation: 'CONTAINS',
          });
          currentContainer = symbol;
        }
      }

      if (definition.imports.includes(node.type)) {
        const moduleName = this.getImportTarget(node);
        if (moduleName) {
          const moduleId = `module:${moduleName}`;
          symbols.push({
            id: moduleId,
            type: 'module',
            name: moduleName,
            file,
            language: definition.language,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
          relationships.push({
            fromId: fileId,
            toId: moduleId,
            from: file,
            to: moduleName,
            relation: 'IMPORTS',
          });
        }
      }

      if (definition.calls.includes(node.type)) {
        const callee = this.getCallName(node);
        if (callee) {
          const referenceId = `reference:${callee}`;
          if (!referenceSymbols.has(referenceId)) {
            referenceSymbols.set(referenceId, {
              id: referenceId,
              type: 'reference',
              name: callee,
              file,
              language: definition.language,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
            });
          }
          relationships.push({
            fromId: currentContainer.id,
            toId: referenceId,
            from: currentContainer.name,
            to: callee,
            relation: 'CALLS',
          });
        }
      }

      for (const child of node.namedChildren) {
        visit(child, currentContainer);
      }
    };

    visit(tree.rootNode, fileSymbol);
    symbols.push(...referenceSymbols.values());
    return { files: [file], symbols, relationships };
  }

  private static getGrammar(
    grammarPackage: GrammarModule,
    language: SupportedLanguage,
    file: string,
  ): object {
    if (language === 'typescript') {
      const grammar = file.toLowerCase().endsWith('.tsx')
        ? grammarPackage.tsx
        : grammarPackage.typescript;
      if (!grammar) {
        throw new Error(`Tree-sitter TypeScript grammar is missing for ${file}`);
      }
      return grammar;
    }

    const grammar = grammarPackage.default ?? (grammarPackage as object);
    if (!grammar) {
      throw new Error(`Tree-sitter grammar is missing for ${language}`);
    }
    return grammar;
  }

  private static getNodeName(node: Parser.SyntaxNode): string | undefined {
    for (const fieldName of ['name', 'declarator', 'function', 'type']) {
      const field = node.childForFieldName(fieldName);
      if (field) {
        const identifier = this.findIdentifier(field);
        if (identifier) {
          return identifier.text;
        }
      }
    }

    const identifier = this.findIdentifier(node);
    return identifier?.text;
  }

  private static findIdentifier(node: Parser.SyntaxNode): Parser.SyntaxNode | undefined {
    if (identifierTypes.has(node.type)) {
      return node;
    }
    for (const child of node.namedChildren) {
      const identifier = this.findIdentifier(child);
      if (identifier) {
        return identifier;
      }
    }
    return undefined;
  }

  private static getImportTarget(node: Parser.SyntaxNode): string | undefined {
    for (const fieldName of ['source', 'path', 'module']) {
      const field = node.childForFieldName(fieldName);
      if (field) {
        return this.removeQuotes(field.text);
      }
    }

    for (const child of node.namedChildren) {
      if (child.type === 'string' || child.type === 'string_literal') {
        return this.removeQuotes(child.text);
      }
    }

    const rawText = node.text;
    const quotedTarget = rawText.match(/["'<]([^"'>]+)["'>]/);
    return quotedTarget?.[1];
  }

  private static getCallName(node: Parser.SyntaxNode): string | undefined {
    const callee =
      node.childForFieldName('function') ??
      node.childForFieldName('name') ??
      node.namedChildren[0];
    if (!callee) {
      return undefined;
    }

    return callee.text.trim();
  }

  private static createSymbol(
    node: Parser.SyntaxNode,
    file: string,
    language: SupportedLanguage,
    type: SymbolType,
    name: string,
  ): ExtractedSymbol {
    const startLine = node.startPosition.row + 1;
    return {
      id: `symbol:${file}:${startLine}:${type}:${name}`,
      type,
      name,
      file,
      language,
      startLine,
      endLine: node.endPosition.row + 1,
      parameters: this.getParameters(node),
    };
  }

  private static getParameters(node: Parser.SyntaxNode): string[] | undefined {
    const parameters =
      node.childForFieldName('parameters') ??
      node.childForFieldName('parameter_list');
    if (!parameters) {
      return undefined;
    }

    const names = parameters.namedChildren
      .map((parameter) => {
        const nameField =
          parameter.childForFieldName('name') ??
          parameter.childForFieldName('pattern');
        const identifier = nameField
          ? this.findIdentifier(nameField)
          : this.findIdentifier(parameter);
        return identifier?.text;
      })
      .filter((name): name is string => Boolean(name));

    return names.length > 0 ? names : undefined;
  }

  private static refineSymbolType(
    node: Parser.SyntaxNode,
    type: SymbolType,
  ): SymbolType {
    if (
      (type === 'function' || type === 'method') &&
      this.hasClassAncestor(node)
    ) {
      return 'method';
    }

    return type;
  }

  private static hasClassAncestor(node: Parser.SyntaxNode): boolean {
    let parent = node.parent;
    while (parent) {
      if (classTypes.has(parent.type)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  private static removeQuotes(value: string): string {
    return value.replace(/^["'`]|["'`]$/g, '').replace(/^<|>$/g, '');
  }
}
