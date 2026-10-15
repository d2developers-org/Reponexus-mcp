# Implementation Plan: Deterministic Query Understanding for AGCP

## Overview

This plan replaces the current rule-based `QueryAnalyzer` with a complete,
deterministic query-to-repository retrieval pipeline. The goal: a user should
be able to describe any software problem in natural language, and the system
should identify the correct files, folders, functions, and dependencies through
MCP **without using an LLM to understand the query**.

Example queries that must all flow through the same retrieval engine:

- "I'm getting an error when I log in."
- "The keyboard is covering the input field."
- "The booking is not reaching nearby online partners."
- "Change the API response format."
- "The app crashes when I open the profile screen."
- "Find where the JWT token is validated."
- "Whenever I give a prompt, find the relevant code and prepare it for correction."

These queries must not require a hardcoded pattern per request type.

The AGCP design already provides the foundation: AST parsing, symbol indexing,
call graphs, dependency graphs, adaptive context expansion, and a minimal
context generator. The improvement is to make query-to-graph matching stronger
and more systematic before MCP returns the relevant context.

---

## 1. Target Architecture

```
1. User Query            Natural language, error messages, stack traces, code snippets
        |
2. Query Preprocessor    Normalize text; extract paths, identifiers, errors, tech terms
        |
3. Feature Extractor     Action rules, problem symptoms, entities, operations, constraints
        |
4. Multi-Strategy        Exact identifier search, error/keyword index,
   Retrieval Engine      synonym/phrase matching, repository graph search
        |
5. Ranking & Confidence  Rank files/symbols from multiple independent signals
        |
6. Adaptive Expansion    Follow imports, callers, callees, routes, types, related modules
        |
7. MCP Context Response  Relevant files, code ranges, dependencies, retrieval evidence
```

**Key distinction:** MCP is the tool interface through which a client requests
context. The query analyzer and retrieval engine perform the actual selection.
This system can be built without an LLM in the query-understanding and
file-selection stages.

**Limitation:** No deterministic system guarantees the correct file for every
possible prompt. The objective is to maximize retrieval accuracy, measure
confidence, and retrieve additional context or request clarification when
evidence is insufficient.

---

## 2. Problems With the Current `QueryAnalyzer.ts`

The existing code is a good prototype but performs keyword extraction and symbol
matching, not complete repository context planning.

| Current implementation | Why it causes problems | Required improvement |
| ---------------------- | ---------------------- | -------------------- |
| `detectIntent()` | Uses a few keywords to decide intent. "Why does login fail?" and "Fix login failure" can be classified differently even though they concern the same code. | Separate the requested action from the technical problem. |
| `extractOperations()` | Relies on rigid regex patterns. Misses indirect requests such as "The login button does nothing." | Use composable rules for actions, symptoms, targets, and constraints. |
| `extractKeywords()` | Removes common words but doesn't understand phrases like "keyboard covers input field" or "booking not reaching partner." | Extract technical phrases and normalize synonyms. |
| `matchSymbols()` | Primarily matches symbol names and file paths. Doesn't search contents, comments, error messages, or behavioral descriptions. | Add multiple retrieval indexes. |
| File scanning | Loops over all graph nodes for every keyword. | Build indexes once and retrieve candidates efficiently. |
| Confidence scores | Uses fixed scores (`1.0`, `0.9`, `0.75`, `0.7`) without combining evidence. | Implement a normalized ranking model with evidence explanations. |
| Graph usage | Matches nodes but doesn't expand through imports, callers, callees, or dependencies. | Add adaptive graph traversal after initial retrieval. |
| Fallback behavior | Defaults to `modify`, which may be wrong for questions or debugging. | Use an explicit `unknown` or `ambiguous` state. |

### The most important issue

Query:

> The keyboard is covering the input field when I try to type.

The current analyzer might extract:

```
keyboard covering input field try type
```

It then searches symbol names and file paths. If the relevant file is named
`LoginScreen.tsx` and its component is named `LoginScreen`, none of those terms
match.

The correct file could be found through a combination of:

- **Symptom normalization:** `keyboard covers input` -> `keyboard avoidance`,
  `input visibility`, `screen resize`.
- **File metadata:** screen components, forms, input handlers, layout components.
- **Graph relationships:** the screen imports a form component or uses a shared layout.
- **Ranking:** files implementing those behaviors receive higher scores.

Better keyword matching alone is not sufficient. Retrieval must be based on the
repository's indexed structure and behavioral metadata.

---

## 3. Design Decisions (Confirmed)

- **Backward compatibility:** `analyzeQuery()` remains a thin wrapper returning
  the legacy `QueryAnalysisResult`. The new engine adds `planContext()` returning
  `ContextPlan`.
- **Metadata generation:** keywords/phrases/error signatures come from a
  **separate source-scan pass** (`RepositoryIndex`). `TreeSitterExtractor` and its
  tests remain untouched.
- **Testing:** graph tests live in `src/graph/` and run via a **new npm script**
  (`test:graph`), not appended to the `src/ast/*.test.ts` glob.
- **Lexical ranking:** BM25 implemented **in-house** with zero new dependencies.

---

## 4. Module Breakdown

Each module has exactly one responsibility, keeping the TypeScript stack,
existing graph types, and MCP architecture.

### A. `QueryPreprocessor.ts`
Normalize the query without losing useful information.
- Preserve original text, file paths, identifiers, stack traces.
- Normalize whitespace, case, punctuation for searching.
- Detect filenames, extensions, line numbers, function names, error codes.
- Separate pasted logs and code snippets from the user's description.

### B. `QueryFeatureExtractor.ts`
Extract multiple independent signals rather than assigning a single intent early.
- **Action:** fix, add, explain, replace, refactor, unknown.
- **Symptoms:** crashes, blank screens, incorrect output, timeouts.
- **Technical entities:** login, API, keyboard, partner, database.
- **Constraints:** Android only, specific screen, no API changes.
- **Explicit identifiers and error messages.**

### C. `QueryVocabulary.ts`
Deterministic technical terminology and synonym rules (data, not prompts).
- `crash` -> runtime failure.
- `doesn't respond` -> unresponsive interaction.
- `not showing` -> rendering or visibility issue.
- `request not reaching server` -> request dispatch or network flow.
- `wrong result` -> incorrect data or business logic.

### D. `RepositoryIndex.ts`
Build a code-aware index (not just filenames). Node shape:

```ts
interface RepositoryIndexEntry {
  id: string;
  name: string;
  filePath: string;
  type:
    | 'file' | 'function' | 'class' | 'component'
    | 'variable' | 'interface' | 'endpoint' | 'model';

  startLine?: number;
  endLine?: number;

  identifiers: string[];
  keywords: string[];
  phrases: string[];
  errorSignatures: string[];

  imports: string[];
  exports: string[];

  parentId?: string;
}
```

Index generation steps:
1. Scan the repository, excluding `node_modules`, build outputs, generated artifacts.
2. Parse supported source with AST tooling (Tree-sitter / `ts-morph`).
3. Extract files, symbols, source ranges, imports, exports, references, calls.
4. Build inverted indexes for names, paths, technical terms, error signatures.
5. Record file-level metadata (screen, API endpoint, middleware, service, model, shared UI).
6. Update only changed files and affected relationships on repository change.
7. Persist as `data/index.json`.

Notes: treat `keywords`, `phrases`, `errorSignatures` as derived index data
generated from repository content and static analysis, not invented by an LLM.
Do not use regex as the main parser (fine for preprocessing and simple error
patterns). Don't rely solely on comments for behavior; code structure and
dependency relationships are primary evidence.

### E. `RepositoryRetriever.ts` + `LexicalRanker.ts`
Search independent indexes and merge candidates.
- **Strategy 1 - Exact matching (highest priority):** filenames, functions,
  classes, symbols, stack traces (`auth.js`, `verifyToken()`, `RealMap.tsx`, error codes).
- **Strategy 2 - Error and log matching:** index known error messages, exception
  types, stack-trace frames and associated files. `Cannot read properties of
  undefined` retrieves the relevant property access, not every file with `undefined`.
- **Strategy 3 - Keyword and phrase retrieval:** inverted index over symbol names,
  file paths, identifiers, comments, code metadata, technical phrases; token
  matching + BM25 (`LexicalRanker.ts`).
- **Strategy 4 - Graph-based retrieval:** expand promising candidates through
  imports, calls, references, containment, routes, other known relationships.

Implement these four before optional vector search (vector search can improve
semantic retrieval later but is not mandatory for a deterministic, non-LLM build).

### F. `ContextRanker.ts`
Merge strategy outputs into one ranked set. Initial weights (starting values,
not validated optima):

| Signal | Initial weight |
| ------ | -------------- |
| Exact filename or symbol match | 30% |
| Error signature or explicit identifier match | 25% |
| Phrase and keyword relevance | 20% |
| Symbol and file role relevance | 15% |
| Graph relationship relevance | 10% |

```ts
interface RetrievalEvidence {
  exactMatch: number;       // 0 to 1
  errorMatch: number;       // 0 to 1
  lexicalRelevance: number; // 0 to 1
  roleRelevance: number;    // 0 to 1
  graphRelevance: number;   // 0 to 1
}

function scoreCandidate(e: RetrievalEvidence): number {
  return (
    e.exactMatch * 0.30 +
    e.errorMatch * 0.25 +
    e.lexicalRelevance * 0.20 +
    e.roleRelevance * 0.15 +
    e.graphRelevance * 0.10
  );
}
```

In production, compute lexical relevance with BM25, normalize signals, and avoid
double-counting. Retain reasons for each result:

```ts
interface RankedCandidate {
  filePath: string;
  score: number;
  matchedTerms: string[];
  matchedSymbols: string[];
  matchedErrors: string[];
  graphReasons: string[];
}
```

Exact identifiers and error signatures have priority rules so an explicit
filename is not outranked by a generic keyword match.

**Confidence and fallback** (score is a ranking score, not a calibrated probability):
- High confidence: return best candidates and expand dependencies.
- Medium confidence: broaden search and compare competing candidates.
- Low confidence: return strongest evidence and mark selection uncertain.

If two unrelated screens score similarly, retrieve both for a bounded second pass
or ask the external assistant to clarify. Never claim a file is definitely correct
because it ranked first.

### G. `ContextPlanner.ts` (Adaptive Graph Expansion)
Initial search finds entry points; traversal finds supporting code.

Example: "The booking request is not reaching nearby online partners. Fix it."
First pass finds booking service, partner search, availability filter. Then follow:

```
Booking screen -> user action/booking request ->
Booking API/controller -> input validation ->
Partner matching service -> online status, distance filtering, vehicle eligibility ->
Database query/notification -> partner retrieval and request delivery
```

(Example roles, not claims about your current repository.)

Expand only along relationships supported by indexed code:
- `imports`: modules a candidate depends on.
- `calls`: functions in the same execution path.
- `calledBy`: upstream callers (add a reverse-edge index).
- `references`: uses of a symbol.
- `contains`: file <-> functions/components.
- `implements` / `routesTo`: interfaces, endpoints, implementations.

Use bounded search with visited-node tracking, relevance thresholds, and a
context budget. Expand highest-ranked candidates first; stop when no new
high-value dependency remains or the budget is reached.

### H. `MCPContextService.ts`
Return structured, traceable context:
- File paths and relevant code ranges.
- Symbol and dependency information.
- Why each result was selected.
- Confidence, truncation, and retrieval status.

---

## 5. Working Across Different Prompt Kinds

The engine must not depend on the word "fix". Identify technical evidence
independently of the requested action.

### Test matrix

| User query | Expected retrieval behavior |
| ---------- | --------------------------- |
| "I'm getting this error: `JWT expired`." | Match error signatures, token validation, auth middleware. |
| "The keyboard covers the input field." | Screen layouts, forms, keyboard handling, navigation. |
| "The booking request is not reaching nearby partners." | Booking flow, partner selection, distance filtering, delivery logic. |
| "Change the response returned by the login API." | Endpoint, controller, response serializer, affected types. |
| "Why is this function slow?" | The function, its callers, expensive operations it invokes. |
| "Find where the user token is stored." | Storage APIs, auth modules, references to token identifiers. |
| "The profile screen crashes on Android." | Profile components, Android-specific code, stack-trace frames. |
| "Improve the entire authentication flow." | Auth entry points, expand dependencies, larger context budget. |

### Crucial design decision

Separate these three questions:
1. **What problem/behavior** is described? Extract terms, errors, symptoms, entities.
2. **What does the user want done?** debugging, explaining, creating, modifying, refactoring.
3. **Which code is relevant?** search and rank candidates, then expand the graph.

Question 3 must not depend entirely on question 2. Both "Why does login fail?"
and "Fix login failure" should initially retrieve similar authentication code.

---

## 6. MCP Response Structure

Return structured context, not just matched symbols:

```ts
interface ContextPlan {
  query: string;

  operation: {
    action:
      | 'fix' | 'create' | 'modify'
      | 'refactor' | 'explain' | 'unknown';
    confidence: number;
  };

  candidates: Array<{
    filePath: string;
    score: number;
    reasons: string[];
    relevantRanges: Array<{
      startLine: number;
      endLine: number;
    }>;
  }>;

  dependencies: Array<{
    source: string;
    target: string;
    relationship: string;
  }>;

  status:
    | 'matched'
    | 'ambiguous'
    | 'insufficient_evidence';

  truncated: boolean;
}
```

Proposed MCP tools:
- `search_repository` - retrieve ranked candidate files and symbols.
- `get_context` - return selected source ranges and surrounding code.
- `trace_dependency` - trace imports, callers, other relationships.
- `impact_analysis` - identify potentially affected code.
- `validate_patch` - validate changes from the external assistant.

The MCP server must never claim code is fixed merely because correct context was
retrieved. Patch generation and validation are separate stages.

> Note: the actual MCP server SDK and tools are a later effort. This plan ends at
> the `ContextPlan` service and CLI, which is MCP-ready.

---

## 7. Measuring Success

Build a benchmark of actual developer prompts; record files that should be
retrieved for each.

| Metric | What it tells you |
| ------ | ----------------- |
| Recall@5 | Whether relevant files appear among the top five results. |
| Precision@5 | How much of the top-five result set is relevant. |
| MRR | How highly the first relevant file ranks. |
| Retrieval latency | How quickly the context planner responds. |
| Context size | How much source code is returned. |
| Token reduction | How much smaller the selected context is than sending entire files/repo. |

Test explicit file requests, vague bug descriptions, stack traces, multi-file
changes, and queries with multiple interpretations.

Do not optimize only for fewer files. A tiny context that omits the actual bug is
worse than a slightly larger context that includes the necessary dependency.

---

## 8. Phased Execution Plan

### Phase 0 - Contracts & benchmark harness
- Extend `src/graph/types.ts` with `RepositoryIndexEntry`, `RetrievalEvidence`,
  `RankedCandidate`, `ContextPlan`, `QueryFeatures`, `RetrievalStatus`
  (`matched | ambiguous | insufficient_evidence`), and the action union incl. `unknown`.
- Add `data/benchmark.json` (the test matrix) and `src/graph/evalRetrieval.ts`
  computing Recall@5, Precision@5, MRR, latency, token reduction.
- **Deliverable:** new `npm run eval` script; `npm run build` passes; benchmark loads.

### Phase 1 - Preprocessor & vocabulary
- `src/graph/QueryPreprocessor.ts`, `src/graph/QueryVocabulary.ts`.
- **Exit:** unit tests pass.

### Phase 2 - Feature extractor
- `src/graph/QueryFeatureExtractor.ts` emitting independent signals with `unknown`
  fallback (no `modify` default). `analyzeQuery()` delegates to it. Update
  `testQueryAnalyzer.ts`.
- **Exit:** "Why does login fail?" and "Fix login failure" share entities/symptoms,
  differing only in action.

### Phase 3 - Behavior-aware repository index
- `src/graph/RepositoryIndex.ts` builds `RepositoryIndexEntry[]` (identifiers,
  keywords, phrases, errorSignatures via a light source scan, imports, exports,
  parentId from `CONTAINS`, inferred role) plus one-time inverted indexes.
  Persist `data/index.json`.
- **Exit:** map-based lookup replaces the per-keyword scans in `matchSymbols`.

### Phase 4 - Multi-strategy retriever
- `src/graph/RepositoryRetriever.ts` + `src/graph/LexicalRanker.ts` (in-house BM25):
  exact id/path, error signature, keyword/phrase, graph-seed. Merge with evidence tags.
- **Exit:** candidates carry per-strategy provenance.

### Phase 5 - Scoring & confidence
- `src/graph/ContextRanker.ts`: weighted model, explicit-match priority, normalized
  signals, no double-count; `RankedCandidate` reasons; score -> `RetrievalStatus`.
- **Exit:** matched/ambiguous/insufficient states with thresholds.

### Phase 6 - Adaptive expansion & planning
- `src/graph/ContextPlanner.ts`: bounded BFS over imports/calls/calledBy/references/
  contains (new reverse-edge `calledBy` index), visited set, thresholds, context
  budget, dedup. Reuse `DependencyBuilder`, `ContextExtractor`, `MinimalContextGenerator`.
- **Exit:** "booking not reaching partners" expands into partner selection +
  distance filter + callers within budget.

### Phase 7 - ContextPlan service & CLI
- `src/graph/MCPContextService.ts` returns `ContextPlan`. New
  `npm run plan -- "<query>"` chaining preprocess -> features -> retrieve -> rank -> plan.
- **Exit:** end-to-end CLI output with evidence and honest status.

### Phase 8 - Benchmark & tuning
- Run `npm run eval`, tune weights/thresholds, document metrics.
- **Exit:** documented Recall@5 / MRR / latency / token-reduction baseline.

---

## 9. New Files & Scripts Summary

New files (under `src/graph/` unless noted):

```
QueryPreprocessor.ts
QueryFeatureExtractor.ts
QueryVocabulary.ts
RepositoryIndex.ts
RepositoryRetriever.ts
LexicalRanker.ts
ContextRanker.ts
ContextPlanner.ts
MCPContextService.ts
evalRetrieval.ts
*.test.ts                      (graph tests)
data/benchmark.json            (under data/)
data/index.json                (generated, under data/)
```

Types added to `src/graph/types.ts`. New npm scripts: `test:graph`, `plan`, `eval`,
`index-graph` (source-scan pass).

---

## 10. Known Data Caveats to Handle in Phase 3

- `graph.json` contains duplicate `FILE` nodes (the same file can appear both as a
  basename node from `ASTConverter` and a full-relative-path node from the
  extractor's file symbol). The index must normalize and dedup paths.
- Path formats are inconsistent across `output.json`/`graph.json` (relative) and
  legacy `day3-symbols.json` (absolute). Normalize before indexing.
- `MODULE` and `reference` nodes are syntax-level only; module paths, overloads,
  and cross-language types are not yet resolved.

---

## 11. Final Recommendation

Build AGCP as a deterministic, multi-stage retrieval and context-planning engine,
not a collection of regex patterns. Priorities:

1. Strong repository indexing using ASTs and relationship graphs.
2. Multi-strategy query retrieval with explicit identifiers, error signatures,
   phrases, and lexical ranking.
3. Evidence-based candidate scoring.
4. Adaptive dependency expansion.
5. A structured MCP response and a benchmark to validate accuracy.

Keep the external LLM responsible for interpreting selected code, proposing
changes, and helping validate results. The AGCP server remains deterministic,
reusable, and independent of any LLM provider.

One final distinction: you can eliminate the LLM from query understanding without
eliminating all semantic ambiguity. When a prompt lacks enough evidence to
distinguish two possible causes, the correct behavior is to search more broadly
within a controlled budget or return an explicit ambiguity result - not to pretend
the system knows which file is correct.
