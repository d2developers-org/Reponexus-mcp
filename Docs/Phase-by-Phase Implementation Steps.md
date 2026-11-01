# AGCP SAGE v2 — Phase-by-Phase Implementation Steps

This document is the step-by-step execution guide for implementing **SAGE v2 (Signal-Activated Graph Engine)** — AGCP's deterministic code retrieval and context planning engine.

Reference architecture: `C:\Users\sudarsan kumar\.gemini\antigravity\brain\0084378e-32fd-4f6c-b390-919f6c059b5e\SAGE-v2-Implementation-Plan.md`.

---

## Confirmed Architectural Decisions

- **Deterministic Context-First Retrieval**: The retrieval engine uses 5 deterministic signals (`QuerySignal`, `WorkspaceSignal`, `ErrorSignal`, `DiffSignal`, `SessionSignal`) without calling an LLM.
- **Deterministic Target Resolver**: Explicitly separates target identification (finding the primary function/class/file) from surrounding context expansion.
- **Multi-Resolution Graph**: 3 levels of nodes (`FILE`, `SYMBOL`, `BLOCK` like `IF`, `TRY`, `CATCH`, `LOOP`, `SWITCH_CASE`) with exact line numbers from Tree-sitter.
- **Max-Propagation Activation Engine**: Uses bounded max-propagation ($P(v) = \max(P(u) \times d)$) with directional rules on `CONTAINS` to eliminate cycle score runaway and sibling contamination.
- **Exact Line Resolver**: Uses AST statement & location inspection within symbols to output narrow line ranges.
- **ContextPlan Output**: Explicitly separates the identified `target` from supporting `regions`.

---

## Phase A — Multi-Resolution Code Graph [✅ COMPLETED]

**Goal:** Build the enriched graph with file, symbol, and block nodes, reverse and semantic edges, and deterministic annotations.

### Delivered:
1. `src/graph/types.ts` extended with:
   - `NodeLevel = 'file' | 'symbol' | 'block'`
   - `BlockType = 'TRY' | 'CATCH' | 'IF' | 'ELSE' | 'LOOP' | 'SWITCH_CASE' | 'BLOCK'`
   - `GraphNodeAnnotation` (`identifiers`, `errorPatterns`, `behaviorTags`, `keywords`)
   - `SAGENode` and `SAGEGraph`
   - Signal types (`Activation`, `QueryInput`, `SignalSource`)
   - Target types (`TargetCandidate`, `TargetResolution`)
   - Line and plan types (`ResolvedRegion`, `ContextPlan`, `RetrievalStatus`, `QueryAction`)
2. `src/graph/CodeGraph.ts`:
   - Tree-sitter AST extraction of `IF`, `TRY`, `CATCH`, `LOOP`, `SWITCH_CASE` block nodes with exact line ranges.
   - Deterministic behavior tag inference (`error-handling`, `validation`, `auth`, `data-fetch`, `rendering`, `routing`, `storage`, `config`).
   - Keyword splitting (`camelCase`, `snake_case`, path segments) and code identifier extraction.
   - `CALLED_BY` reverse index of all `CALLS` edges.
   - `EXPORTS`, `THROWS`, `CATCHES`, `IMPLEMENTS` edge generation.
   - Deduplication of file nodes and structural `parentId` assignment.
3. `src/graph/buildGraph.ts` (CLI entry point):
   - Generates `data/sage-graph.json` in ~500ms.
4. `package.json` scripts:
   - `"build-graph": "tsx src/graph/buildGraph.ts"`
   - `"test:graph": "tsx --test src/graph/*.test.ts"`
5. `src/graph/CodeGraph.test.ts` covering keywords, identifiers, error patterns, behavior tags, and multi-resolution graph construction.

### Exit Criteria Verified:
- `npm run build` compiles with 0 errors.
- `npm run build-graph` produces `data/sage-graph.json` with 543 nodes (21 files, 338 symbols, 184 blocks) and 1,689 edges.
- `npm test` and `npm run test:graph` pass 100%.

---

## Phase B — Signal Collectors, Target Resolver & Activation Engine [✅ COMPLETED]

**Goal:** Given a `QueryInput` (query, activeFile, cursor, errors, diff, session), deterministically identify the primary target and rank relevant surrounding nodes.

### Delivered:
1. `src/graph/signals/SignalCollector.ts` (base interface).
2. Five Signal Collectors:
   - `WorkspaceSignal.ts` (activeFile, cursorLine, openFiles -> node activations)
   - `QuerySignal.ts` (exact qualified symbols, symbol names, paths, error strings, domain identifiers, behavior tags, generic keywords)
   - `ErrorSignal.ts` (stack trace crash frame parser, error patterns, THROWS/CATCHES)
   - `DiffSignal.ts` (git diff parser -> changed files and line ranges)
   - `SessionSignal.ts` (continuity with previous session nodeIds)
3. `src/graph/TargetResolver.ts`:
   - Strict P1–P8 priority matching:
     - P1: Exact qualified symbol (`Class.method`)
     - P2: Exact symbol name
     - P3: Exact file/path
     - P4: Error crash location / signature
     - P5: Workspace cursor location (resolving to enclosing function/method, not local variable)
     - P6: Domain identifiers
     - P7: Behavior tags
     - P8: Generic keywords
   - Disambiguation rules (file constraints, workspace active-file constraints, import constraints).
4. `src/graph/ActivationEngine.ts`:
   - Bounded max-propagation algorithm ($P(v) = \max(P(u) \times d)$).
   - Directional CONTAINS rules (sibling isolation: child -> parent context at 0.50, parent -> child methods at 0.00).
   - Cycle safety with bounded max score <= 1.0.
   - Multi-signal merge with bounded bonus.
5. Unit tests:
   - `src/graph/TargetResolver.test.ts` (exact symbol P2, file constraint, cursor location P5, crash frame P4, insufficient evidence)
   - `src/graph/ActivationEngine.test.ts` (cycle safety, sibling isolation, multi-signal merge, end-to-end repository graph retrieval)

### Exit Criteria Verified:
- Exact symbol queries return correct target with high confidence (>= 0.90).
- Vague queries with workspace context identify the right function (`buildContext()`).
- Mutual recursion / graph cycles never exceed 1.0.
- Sibling methods in the same class are isolated and not auto-activated.
- Uninformed vague queries honestly return `insufficient_evidence`.
- All 14 tests in `npm run test:graph` pass 100%.

---

## Phase C — Line Resolver, Context Assembler & CLI [✅ COMPLETED]

**Goal:** Narrow activated nodes to exact line ranges, extract code, assemble `ContextPlan`, and wire the CLI.

### Delivered:
1. `src/graph/LineResolver.ts`:
   - Exact line narrowing based on evidence:
     - Error stack frames: pinned to crash line ± context window.
     - Workspace cursor: pinned to cursor line ± context window.
     - Block-level AST nodes: exact control-flow block boundaries.
     - Query identifier matches: pinned to matching statements ± context window.
   - Merging overlapping and adjacent line ranges within the same file.
2. `src/graph/ContextAssembler.ts`:
   - Primary target selection preserved separately from supporting code regions.
   - Deduplication and token budgeting (default 8,000 tokens / 32,000 chars, max 15 regions).
   - Source code extraction formatted with file headers and line spans.
   - Trace graph dependencies between included symbols.
   - Honest retrieval status calculation (`matched`, `ambiguous`, `insufficient_evidence`).
3. `src/graph/planContext.ts` (CLI entry point):
   - Supports CLI flags: `--file`, `--cursor`, `--open`, `--errors`, `--diff`, `--json`.
   - Wired npm script: `"plan": "tsx src/graph/planContext.ts"`.
   - Generates formatted terminal reports or raw JSON.
4. Unit and Integration Tests:
   - `src/graph/LineResolver.test.ts` (cursor line pinning, error crash line pinning, range merging).
   - `src/graph/planContext.test.ts` (end-to-end vague query with cursor, exact symbol queries, and insufficient evidence handling).

### Exit Criteria Verified:
- `npm run plan -- "this is not working" --file src/graph/DependencyBuilder.ts --cursor 44` returns target `buildContext()`, exact line range around line 44, supporting types, and human-readable reasons.
- `npm run plan -- "where is extractCodeForNode" --json` returns 92% confidence match on `extractCodeForNode` in `ContextExtractor.ts`.
- `npm run build` compiles with 0 errors.
- `npm test` and `npm run test:graph` pass 100% (20/20 graph tests passed).

---

## Phase D — Benchmark Evaluation & Tuning [✅ COMPLETED]

**Goal:** Benchmark retrieval quality, tune edge decay and thresholds, document metrics.

### Delivered:
1. `data/benchmark.json`:
   - 13 test cases across 5 categories (`exact_symbol`, `workspace_context`, `error_context`, `domain_query`, `insufficient_evidence`).
2. `src/graph/evalRetrieval.ts`:
   - Automated evaluation suite computing Target Accuracy, File Recall, Status Accuracy, Latency, and Token Reduction.
   - Script: `"eval": "tsx src/graph/evalRetrieval.ts"`.
3. Results & Documentation:
   - Output persisted at `data/benchmark-results.json`.
   - Comprehensive report documented at `Docs/SAGE-Benchmark-Results.md`.

### Benchmark Results Verified:
- **Target Accuracy**: **100%** (13/13 test cases passed).
- **File Retrieval Recall**: **100%** (13/13).
- **Status Accuracy**: **100%** (13/13).
- **Average Latency**: **30 ms** per query.
- **Context Token Reduction**: **81%** reduction vs sending full repository.
- Full test suites pass (`npm test` and `npm run test:graph`).
