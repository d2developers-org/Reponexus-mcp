# SAGE Benchmark Evaluation & Metrics Report

This document records the empirical retrieval evaluation of the **Signal-Activated Graph Engine (SAGE v2)** on the RepoNexus MCP repository.

Evaluation script: `npm run eval` (`src/graph/evalRetrieval.ts`)
Benchmark matrix: `data/benchmark.json`
Full run results: `data/benchmark-results.json`

---

## 1. Overall Performance Summary

| Metric | Target Goal | SAGE Result | Status |
|--------|-------------|-------------|--------|
| **Target Accuracy** | $\ge 90\%$ | **100%** (13/13) | ✅ Exceeded |
| **File Retrieval Recall** | $\ge 90\%$ | **100%** (13/13) | ✅ Exceeded |
| **Retrieval Status Accuracy** | $\ge 90\%$ | **100%** (13/13) | ✅ Exceeded |
| **Average Latency** | $< 100\text{ ms}$ | **30 ms** | ✅ Exceeded |
| **Context Token Reduction** | $> 70\%$ | **81%** reduction | ✅ Exceeded |

---

## 2. Category-by-Category Results

### Category A: Exact Symbol Queries (`exact_symbol`)
- **Queries tested**: Method names (`buildContext`), class names (`ContextExtractor`), constrained searches (`extractCodeForNode in ContextExtractor.ts`), standalone functions (`indexRepository`), and paths (`types.ts`).
- **Target Accuracy**: **100%** (5/5)
- **Status**: All returned `MATCHED` with confidence $\ge 88\%$.
- **Finding**: P1/P2 exact matching cleanly identifies the symbol without needing LLM query parsing.

### Category B: Vague Queries with Workspace Context (`workspace_context`)
- **Queries tested**:
  - *"this is not working can you resolve it"* with cursor on line 44 of `DependencyBuilder.ts`.
  - *"fix this error please"* with cursor on line 50 of `ContextExtractor.ts`.
  - *"why does this fail?"* with cursor on line 25 of `MinimalContextGenerator.ts` and open dependency tabs.
- **Target Accuracy**: **100%** (3/3)
- **Status**: All returned `MATCHED`.
- **Finding**: Even when the user prompt contains zero keywords, the workspace cursor signal seeds the graph at the enclosing function (`buildContext`, `extractCodeById`, `generate`), and `LineResolver` pins directly around the active cursor line.

### Category C: Error-Based Queries (`error_context`)
- **Queries tested**:
  - Crash trace pointing to `DependencyBuilder.ts:40`.
  - Crash trace pointing to `ContextExtractor.ts:22`.
- **Target Accuracy**: **100%** (2/2)
- **Status**: All returned `MATCHED`.
- **Finding**: Stack frame parser extracts `file:line` ground truth; `TargetResolver` prioritizes the crash site function over generic nouns in the query.

### Category D: Domain Queries (`domain_query`)
- **Queries tested**: Multi-token domain query for CodeGraph behavior tagging and graph builder.
- **Target Accuracy**: **100%** (1/1)
- **Status**: Returned `MATCHED`.

### Category E: Insufficient Evidence Fallback (`insufficient_evidence`)
- **Queries tested**:
  - *"something is not working can you fix it"* (zero context).
  - *"fix the bug and make it work please"* (generic keywords only).
- **Status Accuracy**: **100%** (2/2)
- **Finding**: SAGE does not hallucinate or guess random candidates when no context is provided. It honestly returns `insufficient_evidence` with empty regions, allowing the connected assistant to ask the user for context.

---

## 3. Tuned Hyperparameters (`SAGE_CONFIG`)

```typescript
{
  maxHops: 3,
  activationThreshold: 0.15,
  multiSignalBonus: 0.15,
  contextWindowLines: 5,
  maxTokenBudget: 8000,
  maxRegions: 15,
  edgeDecay: {
    CONTAINS_UP: 0.50,
    CONTAINS_DOWN: 0.00, // Sibling isolation
    CALLS: 0.70,
    CALLED_BY: 0.65,
    IMPORTS: 0.55,
    THROWS: 0.80,
    CATCHES: 0.80,
    EXPORTS: 0.30,
    IMPLEMENTS: 0.40
  }
}
```

---

## 4. Conclusion

SAGE v2 achieves **100% target accuracy**, **100% file recall**, and **81% context reduction** at an average latency of **30 ms**, completely deterministically without using an LLM for query understanding or code retrieval.

