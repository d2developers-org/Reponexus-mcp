import * as fs from 'node:fs';
import * as path from 'node:path';
import Parser = require('tree-sitter');
import {
  BlockType,
  EnrichedEdgeRelation,
  GraphEdge,
  GraphNodeAnnotation,
  NodeLevel,
  SAGEGraph,
  SAGENode,
} from './types';
import { StandardizedOutput, SupportedLanguage } from '../ast/types';
import {
  LanguageDefinition,
  languageForPath,
} from '../ast/TreeSitterLanguage';
import { indexRepository } from '../ast/indexRepository';

// Block syntax mappings for Tree-sitter node types across supported languages
const BLOCK_TYPE_MAP: Record<string, BlockType> = {
  // If statements & branches
  if_statement: 'IF',
  if_expression: 'IF',
  elif_clause: 'IF',
  else_clause: 'ELSE',

  // Try / Catch / Except
  try_statement: 'TRY',
  catch_clause: 'CATCH',
  except_clause: 'CATCH',

  // Loops
  for_statement: 'LOOP',
  for_in_statement: 'LOOP',
  for_of_statement: 'LOOP',
  while_statement: 'LOOP',
  do_statement: 'LOOP',
  loop_expression: 'LOOP',
  for_expression: 'LOOP',
  while_expression: 'LOOP',

  // Switch / Match
  switch_case: 'SWITCH_CASE',
  switch_default: 'SWITCH_CASE',
  case_clause: 'SWITCH_CASE',
  match_arm: 'SWITCH_CASE',
  switch_block_statement_group: 'SWITCH_CASE',
};

// Grammar package loader for Tree-sitter
interface GrammarModule {
  typescript?: object;
  tsx?: object;
  default?: object;
}

function getGrammar(grammarPackage: GrammarModule, language: SupportedLanguage, filePath: string): object {
  if (language === 'typescript') {
    const grammar = filePath.toLowerCase().endsWith('.tsx')
      ? grammarPackage.tsx
      : grammarPackage.typescript;
    if (!grammar) {
      throw new Error(`Tree-sitter TypeScript grammar missing for ${filePath}`);
    }
    return grammar;
  }
  const grammar = grammarPackage.default ?? (grammarPackage as object);
  if (!grammar) {
    throw new Error(`Tree-sitter grammar missing for ${language}`);
  }
  return grammar;
}

/**
 * Split names, identifiers, and paths into searchable keywords (camelCase, snake_case, kebab-case).
 */
export function splitKeywords(text: string): string[] {
  if (!text) return [];
  const tokens = text
    .replace(/[\\/._\-:]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1 && !/^\d+$/.test(t));
  return Array.from(new Set(tokens));
}

/**
 * Extract identifier tokens from source code snippet.
 */
export function extractIdentifiers(source: string): string[] {
  if (!source) return [];
  const matches = source.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
  const unique = new Set<string>();
  for (const m of matches) {
    if (m.length > 2 && !/^(function|return|const|let|var|class|import|from|export|public|private|static|async|await|true|false|null|undefined|this|new|void|type|interface)$/.test(m)) {
      unique.add(m);
    }
  }
  return Array.from(unique);
}

/**
 * Extract error patterns (throw expressions, Error messages, reject reasons).
 */
export function extractErrorPatterns(source: string): string[] {
  if (!source) return [];
  const patterns = new Set<string>();

  // Matches throw new Error("..."), throw "...", new CustomError("...")
  const throwRegex = /throw\s+(?:new\s+([A-Za-z0-9_$]+)\s*\(\s*["'`]?([^"'`)]+)["'`]?|\s*["'`]?([^"'`;]+)["'`]?)/g;
  let match: RegExpExecArray | null;
  while ((match = throwRegex.exec(source)) !== null) {
    const errorType = match[1];
    const message = match[2] || match[3];
    if (errorType) patterns.add(errorType.trim());
    if (message && message.trim().length > 2) patterns.add(message.trim());
  }

  // Matches catch (err) or catch (e: SpecificError)
  const catchRegex = /catch\s*\(\s*(?:[A-Za-z0-9_$]+\s*:\s*)?([A-Za-z0-9_$]+)\s*\)/g;
  while ((match = catchRegex.exec(source)) !== null) {
    const typeOrVar = match[1];
    if (typeOrVar && (typeOrVar.endsWith('Error') || typeOrVar.endsWith('Exception'))) {
      patterns.add(typeOrVar.trim());
    }
  }

  return Array.from(patterns);
}

/**
 * Deterministically infer behavior tags according to the SAGE specification.
 */
export function inferBehaviorTags(
  name: string,
  filePath: string,
  source: string,
  identifiers: string[]
): string[] {
  const tags = new Set<string>();
  const lowerName = name.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  const lowerSource = source.toLowerCase();
  const idLower = new Set(identifiers.map((i) => i.toLowerCase()));

  const hasAnyId = (candidates: string[]) =>
    candidates.some((c) => idLower.has(c) || lowerName.includes(c));

  // error-handling
  if (
    lowerSource.includes('throw ') ||
    lowerSource.includes('catch') ||
    lowerSource.includes('reject(') ||
    lowerSource.includes('console.error') ||
    hasAnyId(['error', 'exception'])
  ) {
    tags.add('error-handling');
  }

  // validation
  if (
    hasAnyId(['validate', 'check', 'verify', 'assert', 'sanitize', 'isvalid', 'ensure']) ||
    lowerSource.includes('validation')
  ) {
    tags.add('validation');
  }

  // auth
  if (
    hasAnyId(['token', 'auth', 'login', 'session', 'credential', 'jwt', 'password', 'user', 'role', 'permission']) ||
    lowerPath.includes('auth')
  ) {
    tags.add('auth');
  }

  // data-fetch
  if (
    hasAnyId(['fetch', 'http', 'request', 'axios', 'api', 'query', 'get', 'post', 'endpoint', 'client']) ||
    lowerSource.includes('fetch(') ||
    lowerSource.includes('http.')
  ) {
    tags.add('data-fetch');
  }

  // rendering
  if (
    hasAnyId(['render', 'component', 'jsx', 'html', 'template', 'view', 'screen', 'widget', 'ui']) ||
    lowerSource.includes('return <') ||
    lowerSource.includes('react') ||
    lowerPath.endsWith('.tsx') ||
    lowerPath.endsWith('.jsx')
  ) {
    tags.add('rendering');
  }

  // routing
  if (
    hasAnyId(['route', 'router', 'endpoint', 'path', 'middleware', 'handler', 'express', 'controller']) ||
    lowerSource.includes('app.get') ||
    lowerSource.includes('app.post') ||
    lowerSource.includes('router.')
  ) {
    tags.add('routing');
  }

  // storage
  if (
    hasAnyId(['store', 'save', 'persist', 'cache', 'database', 'repo', 'repository', 'table', 'model']) ||
    lowerSource.includes('localstorage') ||
    lowerSource.includes('database')
  ) {
    tags.add('storage');
  }

  // config
  if (
    lowerPath.includes('config') ||
    lowerPath.includes('.env') ||
    lowerPath.includes('settings') ||
    lowerPath.includes('constant') ||
    hasAnyId(['config', 'setting', 'options', 'environment'])
  ) {
    tags.add('config');
  }

  return Array.from(tags);
}

export class CodeGraph {
  public static build(
    repositoryRoot: string,
    existingOutput?: StandardizedOutput
  ): SAGEGraph {
    const root = path.resolve(repositoryRoot);
    const astOutput = existingOutput ?? indexRepository(root);

    const nodesMap = new Map<string, SAGENode>();
    const edges: GraphEdge[] = [];
    const fileSourceCache = new Map<string, string>();

    const getFileSource = (relPath: string): string => {
      if (fileSourceCache.has(relPath)) {
        return fileSourceCache.get(relPath)!;
      }
      const absPath = path.join(root, relPath);
      let content = '';
      if (fs.existsSync(absPath)) {
        content = fs.readFileSync(absPath, 'utf8');
      }
      fileSourceCache.set(relPath, content);
      return content;
    };

    // 1. Create unique FILE nodes (deduplicate base name vs full path)
    const normalizedFiles = Array.from(new Set(astOutput.files)).sort();

    for (const filePath of normalizedFiles) {
      const fileId = `file:${filePath}`;
      const source = getFileSource(filePath);
      const lines = source.length === 0 ? 0 : source.split(/\r?\n/).length;
      const fileName = filePath.split('/').pop() || filePath;
      const identifiers = extractIdentifiers(source.slice(0, 10000));
      const errorPatterns = extractErrorPatterns(source);
      const behaviorTags = inferBehaviorTags(fileName, filePath, source, identifiers);
      const keywords = splitKeywords(filePath);

      nodesMap.set(fileId, {
        id: fileId,
        type: 'FILE',
        name: fileName,
        filePath,
        startLine: 1,
        endLine: Math.max(1, lines),
        level: 'file',
        parentId: undefined,
        annotation: {
          identifiers: identifiers.slice(0, 50),
          errorPatterns,
          behaviorTags,
          keywords,
        },
      });
    }

    // 2. Create SYMBOL nodes
    const symbolsByFile = new Map<string, SAGENode[]>();

    for (const sym of astOutput.symbols) {
      if (sym.type === 'file' || sym.type === 'module' || sym.type === 'reference') {
        continue;
      }

      const filePath = sym.file;
      const fileSource = getFileSource(filePath);
      const fileLines = fileSource.split(/\r?\n/);
      const startIdx = Math.max(0, sym.startLine - 1);
      const endIdx = Math.min(fileLines.length, sym.endLine);
      const symSource = fileLines.slice(startIdx, endIdx).join('\n');

      const identifiers = extractIdentifiers(symSource);
      const errorPatterns = extractErrorPatterns(symSource);
      const behaviorTags = inferBehaviorTags(sym.name, filePath, symSource, identifiers);
      const keywords = splitKeywords(sym.name);

      const symbolNode: SAGENode = {
        id: sym.id,
        type: sym.type.toUpperCase(),
        name: sym.name,
        filePath,
        startLine: sym.startLine,
        endLine: sym.endLine,
        level: 'symbol',
        parentId: `file:${filePath}`, // Default parent is the file; refined later by CONTAINS
        annotation: {
          identifiers,
          errorPatterns,
          behaviorTags,
          keywords,
        },
      };

      nodesMap.set(symbolNode.id, symbolNode);

      if (!symbolsByFile.has(filePath)) {
        symbolsByFile.set(filePath, []);
      }
      symbolsByFile.get(filePath)!.push(symbolNode);
    }

    // 3. Process base relationships and assign structural parentId
    for (const rel of astOutput.relationships) {
      const relation = rel.relation.toUpperCase() as EnrichedEdgeRelation;
      edges.push({
        sourceId: rel.fromId,
        targetId: rel.toId,
        relation,
      });

      // Refine parentId: if A CONTAINS B, then B.parentId = A
      if (relation === 'CONTAINS') {
        const targetNode = nodesMap.get(rel.toId);
        if (targetNode) {
          targetNode.parentId = rel.fromId;
        }
      }
    }

    // 4. Extract BLOCK nodes via Tree-sitter for all supported source files
    for (const filePath of normalizedFiles) {
      const definition = languageForPath(filePath);
      if (!definition) continue;

      const source = getFileSource(filePath);
      if (!source.trim()) continue;

      try {
        const parser = new Parser();
        const grammarPackage = require(definition.grammarPackage) as GrammarModule;
        const grammar = getGrammar(grammarPackage, definition.language, filePath);
        parser.setLanguage(grammar);

        const tree = parser.parse(source);
        const fileSymbols = (symbolsByFile.get(filePath) || []).sort(
          (a, b) => a.startLine - b.startLine || b.endLine - a.endLine
        );

        // Find enclosing symbol for a given line range
        const findEnclosingSymbol = (startLine: number, endLine: number): SAGENode | undefined => {
          for (const s of fileSymbols) {
            if (s.startLine <= startLine && s.endLine >= endLine) {
              return s;
            }
          }
          return undefined;
        };

        // Recursively visit AST to identify blocks
        const visitBlocks = (
          node: Parser.SyntaxNode,
          parentContainerId: string
        ): void => {
          let currentContainerId = parentContainerId;
          const mappedType = BLOCK_TYPE_MAP[node.type];

          if (mappedType) {
            const startLine = node.startPosition.row + 1;
            const endLine = node.endPosition.row + 1;
            const blockId = `block:${filePath}:${startLine}:${endLine}:${mappedType}`;

            // Determine structural container
            let containerId = currentContainerId;
            if (containerId === `file:${filePath}`) {
              const enclosing = findEnclosingSymbol(startLine, endLine);
              if (enclosing) {
                containerId = enclosing.id;
              }
            }

            const blockSource = node.text;
            const identifiers = extractIdentifiers(blockSource);
            const errorPatterns = extractErrorPatterns(blockSource);
            const behaviorTags = inferBehaviorTags(
              `${mappedType.toLowerCase()}Block`,
              filePath,
              blockSource,
              identifiers
            );
            const keywords = splitKeywords(`${mappedType} ${identifiers.slice(0, 5).join(' ')}`);

            const blockNode: SAGENode = {
              id: blockId,
              type: mappedType,
              name: `${mappedType.toLowerCase()} (L${startLine}-L${endLine})`,
              filePath,
              startLine,
              endLine,
              level: 'block',
              blockType: mappedType,
              parentId: containerId,
              annotation: {
                identifiers,
                errorPatterns,
                behaviorTags,
                keywords,
              },
            };

            nodesMap.set(blockId, blockNode);
            edges.push({
              sourceId: containerId,
              targetId: blockId,
              relation: 'CONTAINS',
            });

            currentContainerId = blockId;
          }

          for (const child of node.namedChildren) {
            visitBlocks(child, currentContainerId);
          }
        };

        visitBlocks(tree.rootNode, `file:${filePath}`);
      } catch (e) {
        // Tree-sitter parsing failure on edge file - keep going
        console.warn(`[CodeGraph] Notice: Block extraction skipped for ${filePath}: ${e}`);
      }
    }

    // 5. Build Enriched Edges: CALLED_BY, THROWS, CATCHES, EXPORTS, IMPLEMENTS
    const extraEdges: GraphEdge[] = [];
    const existingEdgeKeys = new Set(
      edges.map((e) => `${e.relation}:${e.sourceId}:${e.targetId}`)
    );

    const addEdgeSafely = (sourceId: string, targetId: string, relation: EnrichedEdgeRelation) => {
      const key = `${relation}:${sourceId}:${targetId}`;
      if (!existingEdgeKeys.has(key)) {
        existingEdgeKeys.add(key);
        extraEdges.push({ sourceId, targetId, relation });
      }
    };

    // A. CALLED_BY (exact reverse of every CALLS edge)
    for (const edge of edges) {
      if (edge.relation === 'CALLS') {
        addEdgeSafely(edge.targetId, edge.sourceId, 'CALLED_BY');
      }
    }

    // B. EXPORTS, THROWS, CATCHES, IMPLEMENTS
    for (const node of nodesMap.values()) {
      const source = getFileSource(node.filePath);

      // EXPORTS (file -> exported symbols)
      if (node.level === 'symbol') {
        const fileLines = source.split(/\r?\n/);
        const line = fileLines[node.startLine - 1] || '';
        if (/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\b/.test(line)) {
          addEdgeSafely(`file:${node.filePath}`, node.id, 'EXPORTS');
        }
      }

      // THROWS & CATCHES
      if (node.annotation.errorPatterns.length > 0) {
        for (const errPattern of node.annotation.errorPatterns) {
          const errorTargetId = `error:${errPattern}`;
          if (node.blockType === 'CATCH') {
            addEdgeSafely(node.id, errorTargetId, 'CATCHES');
          } else {
            addEdgeSafely(node.id, errorTargetId, 'THROWS');
          }
        }
      }

      // IMPLEMENTS (class -> interface)
      if (node.level === 'symbol' && node.type === 'CLASS') {
        const fileLines = source.split(/\r?\n/);
        const line = fileLines[node.startLine - 1] || '';
        const match = line.match(/\b(?:implements|extends)\s+([A-Za-z0-9_$,\s]+)/);
        if (match) {
          const targets = match[1].split(',').map((t) => t.trim().split(/\s+/)[0]);
          for (const targetName of targets) {
            // Find interface or class node matching targetName
            for (const otherNode of nodesMap.values()) {
              if (
                otherNode.level === 'symbol' &&
                otherNode.name === targetName &&
                (otherNode.type === 'INTERFACE' || otherNode.type === 'CLASS')
              ) {
                addEdgeSafely(node.id, otherNode.id, 'IMPLEMENTS');
              }
            }
          }
        }
      }
    }

    edges.push(...extraEdges);

    return {
      nodes: Array.from(nodesMap.values()),
      edges,
    };
  }

  /**
   * Build and persist the SAGE graph to data/sage-graph.json.
   */
  public static buildAndPersist(
    repositoryRoot: string,
    outputPath?: string
  ): SAGEGraph {
    const root = path.resolve(repositoryRoot);
    const targetPath =
      outputPath ?? path.join(root, 'data', 'sage-graph.json');

    const graph = this.build(root);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

    return graph;
  }
}

