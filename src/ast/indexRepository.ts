import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtractedRelationship, ExtractedSymbol, StandardizedOutput } from './types';
import { languageForPath } from './TreeSitterLanguage';
import { TreeSitterExtractor } from './TreeSitterExtractor';

const skippedDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  '.venv',
  'node_modules',
  'build',
  'coverage',
  'dist',
  'target',
]);

export function indexRepository(repositoryPath: string): StandardizedOutput {
  const root = path.resolve(repositoryPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Repository directory does not exist: ${root}`);
  }

  const files: string[] = [];
  const symbols: ExtractedSymbol[] = [];
  const relationships: ExtractedRelationship[] = [];

  const visitDirectory = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          visitDirectory(path.join(directory, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const definition = languageForPath(absolutePath);
      if (!definition) {
        continue;
      }

      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const source = fs.readFileSync(absolutePath, 'utf8');
      const extracted = TreeSitterExtractor.extractFrom(source, relativePath, definition);
      files.push(...extracted.files);
      symbols.push(...extracted.symbols);
      relationships.push(...extracted.relationships);
    }
  };

  visitDirectory(root);

  const declarationsByName = new Map<string, ExtractedSymbol[]>();
  for (const symbol of symbols) {
    if (symbol.type === 'file' || symbol.type === 'module' || symbol.type === 'reference') {
      continue;
    }
    const matches = declarationsByName.get(symbol.name) ?? [];
    matches.push(symbol);
    declarationsByName.set(symbol.name, matches);
  }

  for (const relationship of relationships) {
    if (relationship.relation !== 'CALLS') {
      continue;
    }
    const calleeName = relationship.to.split('.').pop() ?? relationship.to;
    const matches = declarationsByName.get(calleeName) ?? [];
    if (matches.length === 1) {
      relationship.toId = matches[0].id;
    }
  }

  const usedReferences = new Set(
    relationships
      .filter((relationship) => relationship.relation === 'CALLS')
      .map((relationship) => relationship.toId)
      .filter((id) => id.startsWith('reference:')),
  );
  const uniqueSymbols = new Map<string, ExtractedSymbol>();
  for (const symbol of symbols) {
    if (symbol.type === 'reference' && !usedReferences.has(symbol.id)) {
      continue;
    }
    if (!uniqueSymbols.has(symbol.id)) {
      uniqueSymbols.set(symbol.id, symbol);
    }
  }

  const uniqueRelationships = new Map<string, ExtractedRelationship>();
  for (const relationship of relationships) {
    const key = `${relationship.relation}:${relationship.fromId}:${relationship.toId}`;
    if (!uniqueRelationships.has(key)) {
      uniqueRelationships.set(key, relationship);
    }
  }

  return {
    files: [...new Set(files)].sort(),
    symbols: [...uniqueSymbols.values()],
    relationships: [...uniqueRelationships.values()],
  };
}

function main(): void {
  const repositoryPath = process.argv[2] ?? process.cwd();
  const outputPath = path.join(process.cwd(), 'data', 'output.json');
  const output = indexRepository(repositoryPath);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(
    `Indexed ${output.files.length} files, ${output.symbols.length} symbols, and ` +
      `${output.relationships.length} relationships to ${outputPath}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Repository indexing failed:', error);
    process.exitCode = 1;
  }
}
