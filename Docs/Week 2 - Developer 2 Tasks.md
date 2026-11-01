# AGCP Project - Week 2 Tasks
## Developer 2: Adaptive Graph and Context Planning

### Week 2 objective
Integrate Developer 1's repository-analysis output with the graph, resolve a user's query to the correct symbol, and build the first working Adaptive Context Planner. By the end of the week, the system should return the smallest useful set of connected symbols for a user request.

### Starting point from the study work

Developer 2's Week 1 study established the graph model and traversal foundations:

- A graph contains `FILE`, `CLASS`, `FUNCTION`, and `METHOD` nodes.
- Edges represent `CONTAINS`, `IMPORTS`, and `CALLS` relationships.
- `Node` stores an ID, type, name, and optional file path.
- `Edge` stores a source, relationship type, and target.
- BFS and DFS traversal visit connected nodes while tracking visited IDs.
- The TypeScript project contains an in-memory graph, JSON loader, and query engine.
- `GraphQueryEngine` currently supports node lookup, children, callers, callees, imports, references, and depth-based context expansion.

The Week 2 implementation should extend these foundations rather than introduce a separate graph model.

## Daily work plan

### Day 1 - Graph integration

**Study and verify**

- Review Developer 1's AST-derived JSON format.
- Confirm the shared node fields: ID, type, name, file path, start line, and end line.
- Confirm the shared edge fields: source, target, and relationship.
- Validate `FILE`, `CLASS`, `FUNCTION`, `METHOD`, and `INTERFACE` nodes.
- Validate `CONTAINS`, `IMPORTS`, `CALLS`, `REFERENCES`, `EXTENDS`, and `IMPLEMENTS` relationships.

**Build**

- Load the repository analysis JSON through `GraphLoader`.
- Populate `InMemoryGraph` with all valid nodes before adding edges.
- Validate edge endpoints and report malformed relationships clearly.
- Prevent duplicate nodes and duplicate edges where necessary.
- Run the loader against a complete sample repository graph.

**Expected output**

- A complete repository graph is generated automatically from Developer 1's output.
- The graph contains the expected symbols and relationships without invalid edges.

### Day 2 - Query target resolution

**Study and verify**

- Understand the shape of a user query and its important keywords.
- Extract likely file names, class names, function names, and method names.
- Handle queries that contain descriptive text around a symbol.
- Decide how multiple matching nodes should be ranked or returned.

**Build**

- Add target-resolution logic around `GraphQueryEngine.findNode`.
- Match exact symbol names first, then file or case-insensitive matches where appropriate.
- Return a stable result for zero, one, and multiple matches.
- Preserve the selected node's file and source-location metadata.

**Example**

```text
Query: "Modify loginUser() logic"
Target: the loginUser method node
```

**Expected output**

- The system identifies the target symbol or reports that no unambiguous target was found.

### Day 3 - Adaptive context expansion

**Study and verify**

- Traverse relationships from the selected target node.
- Understand the difference between direct dependencies and callers/references.
- Follow `CALLS`, `IMPORTS`, `REFERENCES`, `EXTENDS`, and `IMPLEMENTS` only when useful.
- Track visited nodes to avoid cycles and repeated context.

**Build**

- Extend the existing depth-based expansion into an adaptive traversal.
- Add relationship-aware expansion rules instead of following every edge equally.
- Include the target node first, then add only relevant connected symbols.
- Retain each node's traversal depth and relationship that caused inclusion.
- Support a configurable maximum depth.

**Example**

```text
loginUser()
  -> CALLS verifyPassword()
  -> CALLS generateToken()
  -> REFERENCES UserModel
```

**Expected output**

- The planner returns relevant connected symbols grouped or annotated by traversal depth.

### Day 4 - Relevance and stopping logic

**Study and verify**

- Define the maximum traversal depth for the first planner version.
- Prioritize relationships by usefulness to a code-change request.
- Prevent unrelated branches from expanding indefinitely.
- Define what "sufficient context" means for a query.

**Build**

- Add a depth limit, with an initial default of `3`.
- Prioritize relationships in this order: `CALLS`, `IMPORTS`, then `REFERENCES`.
- Skip unrelated branches and already visited nodes.
- Stop when the depth limit is reached or no new relevant nodes remain.
- Keep the result smaller than an unrestricted graph traversal.

**Expected output**

- The planner returns a smaller, more relevant subgraph instead of the whole repository graph.

### Day 5 - Context Planning Engine

**Study and verify**

- Combine target resolution and adaptive expansion into one workflow.
- Define the planner input and output contract.
- Confirm that selected node IDs can be passed to Developer 1's context extractor.
- Prepare sample queries that exercise direct calls, imports, and references.

**Build**

- Add a Context Planner API or function that accepts a user query and graph.
- Resolve the query to a target node.
- Expand the target using the relevance and stopping rules.
- Return the target, selected symbol IDs, nodes, relationships, and traversal metadata.
- Keep the output ready for Developer 1's minimal-context generator.

**Example output**

```json
{
  "target": "loginUser",
  "selectedSymbols": [
    "loginUser",
    "verifyPassword",
    "generateToken",
    "UserModel"
  ],
  "maxDepth": 3
}
```

**Expected output**

- A working Adaptive Context Planner prototype that produces a selected symbol list for sample repository queries.

## Week 2 deliverables

- Repository graph integration.
- User-query target identification.
- Adaptive graph traversal.
- Relationship priority and traversal stopping logic.
- Selected-symbol output for the context generator.
- Context Planner API or callable engine.
- Sample repository tests covering target lookup and connected context expansion.

## Definition of done

By the end of Week 2, Developer 2 can:

1. Load Developer 1's repository analysis into the graph.
2. Resolve a user query to a target symbol or clearly report ambiguity.
3. Expand only the relevant connected nodes using relationship-aware rules.
4. Stop traversal at the configured depth or when sufficient context is found.
5. Return a minimal selected-symbol list that Developer 1 can use to extract exact code.

## Shared integration checkpoints

- Agree on the node and edge schema with Developer 1.
- Use the same symbol IDs and source-location fields across both modules.
- Test with a shared sample repository containing files, classes, methods, imports, and calls.
- Send the selected symbol IDs to Developer 1's context extraction and minimal-context generator.
- Run an integration query such as `"Modify loginUser() logic"` and confirm that the result includes the target and required related symbols only.

## Week 2 success scenario

```text
User query
  -> target node: loginUser()
  -> relevant expansion: verifyPassword(), generateToken(), UserModel
  -> selected symbol IDs
  -> minimal context package for the Planner or LLM
```
