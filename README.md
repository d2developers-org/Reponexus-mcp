# Reponexus-mcp

Repository source is parsed with Tree-sitter grammars and normalized into a
shared symbol-and-relationship graph. The current syntax adapters support
JavaScript, TypeScript/TSX, Python, Java, C++, Go, and Rust. `ts-morph` remains
available for a future TypeScript semantic-enrichment stage; graph extraction
does not depend on it.

## Build a repository graph

Install dependencies and compile-check the project:

```sh
npm install
npm run build
```

Index the current repository, or pass another repository directory:

```sh
npm run index
npm run index -- C:\path\to\repository
```

The indexer writes `data/output.json` with the existing `files`, `symbols`, and
`relationships` top-level fields. Supported source files are selected by
extension; `.git`, `node_modules`, and common generated/build directories are
skipped. Imports and calls are syntax-level relationships: the indexer does
not yet resolve module paths, overloads, or cross-language types.

Run the extractor tests with:

```sh
npm test
```


Implemented the Tree-sitter multi-language graph extraction path.

Added grammar adapters for JavaScript, TypeScript/TSX, Python, Java, C++, Go, and Rust in TreeSitterLanguage.ts.
Added normalized symbol, import, containment, and call extraction in TreeSitterExtractor.ts, plus repository scanning and the npm run index entry point in indexRepository.ts.
Kept the existing files, symbols, and relationships output fields; symbols now have stable IDs and language labels, and edges include endpoint IDs.
Replaced the TypeScript-only graph extraction path. ts-morph remains in the project for the existing learning code and possible later semantic enrichment.
Updated README.md and Adaptive Graph.md with usage and architecture details.
Pinned mutually compatible grammar versions because the suggested newer package versions had conflicting Tree-sitter peer requirements. npm audit reports zero vulnerabilities.
Validation passed: npm run build, npm test (including all seven languages and TSX), npm audit, and git diff --check. The pre-existing .gitignore change was left untouched.