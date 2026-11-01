# Developer 2 - Week 1 and Week 2 Study Guide

## Role

Developer 2 is responsible for the graph and code-relationship side of the AGCP project. The goal is to transform repository-analysis data into a graph, understand a user's request, and return the smallest useful set of connected symbols.

By the end of Week 2, the complete workflow should be:

```text
Repository analysis JSON
        |
        v
Load files, symbols, and relationships
        |
        v
Build the in-memory graph
        |
        v
Resolve the user's query to a target symbol
        |
        v
Expand relevant connected symbols
        |
        v
Apply relationship priority and depth limits
        |
        v
Return a minimal context package
```

---

## Week 1: Graph Foundations

### Day 1 - Graph Fundamentals

#### Study

- What a graph is
- Nodes and edges
- Directed graphs
- Dependency graphs
- Call graphs
- Breadth-first search (BFS)
- Depth-first search (DFS)
- Visited-node tracking

#### Build

Create a simple graph containing relationships such as:

```text
loginUser()
    |
    +-- CALLS --> verifyPassword()
    +-- CALLS --> generateToken()
```

#### Expected result

You should be able to explain how code elements become nodes and how relationships between them become directed edges.

---

### Day 2 - Design the AGCP Graph

#### Study

Node types:

- `FILE`
- `CLASS`
- `FUNCTION`
- `METHOD`
- `INTERFACE`

Relationship types:

- `CONTAINS`
- `IMPORTS`
- `CALLS`
- `REFERENCES`
- `EXTENDS`
- `IMPLEMENTS`

Each node should have an ID, type, name, file path, and optional source-location fields such as `startLine` and `endLine`.

#### Build

Document and agree on the shared node and edge schema with Developer 1.

Example:

```text
auth.ts
    |
    +-- CONTAINS --> AuthService
                         |
                         +-- CONTAINS --> loginUser()
                                              |
                                              +-- CALLS --> verifyPassword()
                                              +-- CALLS --> generateToken()
```

#### Expected result

A documented graph schema that both developers can use consistently.

---

### Day 3 - Graph Storage: In-Memory Graph

#### Study

- How to store nodes by ID
- How to store edges
- How to retrieve a node
- How to retrieve outgoing edges
- How to retrieve incoming edges
- Why edge endpoints must refer to existing nodes

#### Build

Implement an in-memory graph with operations such as:

```typescript
addNode(node)
addEdge(edge)
getNode(id)
getEdgesFrom(id)
getEdgesTo(id)
getAllNodes()
getAllEdges()
```

#### Expected result

A working graph structure that can store files, symbols, and relationships.

---

### Day 4 - Graph Queries

#### Study

Learn how to answer questions about the graph:

- Which node has this name?
- What symbols does this file or class contain?
- Which functions call this function?
- Which functions does this function call?
- What does this file import?
- Which nodes reference this symbol?

#### Build

Implement query operations such as:

```typescript
findNode(name)
getChildren(id)
getCallers(id)
getCallees(id)
getImports(fileId)
getReferences(id)
```

#### Example

```text
getCallees("loginUser")
    -> verifyPassword()
    -> generateToken()
```

#### Expected result

Basic graph queries return the correct related symbols.

---

### Day 5 - Basic Context Expansion

#### Study

- Depth-based traversal
- Direct dependencies versus deeper dependencies
- Maximum traversal depth
- Visited-node tracking
- Early stopping when no new nodes remain

#### Build

Start from a target symbol and expand its outgoing relationships by depth.

Example:

```text
Depth 0 -> loginUser()
Depth 1 -> verifyPassword(), generateToken()
Depth 2 -> their dependencies
```

#### Expected result

The graph returns related symbols grouped by traversal depth instead of returning the entire repository.

---

## Week 2: Adaptive Context Planning

### Day 1 - Graph Integration

#### Study

Review Developer 1's repository-analysis JSON format:

- Files
- Symbols
- Node IDs
- Node types
- Names
- File paths
- Start and end lines
- Relationship source IDs
- Relationship target IDs
- Relationship types

#### Build

Load the JSON into the in-memory graph in this order:

1. Add all file nodes.
2. Add all symbol nodes.
3. Validate relationship types.
4. Validate that relationship endpoints exist.
5. Add valid edges.
6. Report or skip malformed relationships clearly.

#### Expected result

A complete repository graph is created from Developer 1's output without invalid edges.

---

### Day 2 - Query Target Resolution

#### Study

Understand how a natural-language request identifies a graph node.

Example:

```text
Modify loginUser() logic
```

The intended target is the `loginUser` function or method node.

Matching should generally prioritize:

1. Exact symbol name
2. Case-insensitive symbol name
3. Symbol name found inside the query
4. File-path matches
5. Ambiguity detection when multiple nodes have the same score

#### Build

Add target-resolution logic around node lookup. The result should report one of these states:

- `matched`
- `ambiguous`
- `not-found`

The selected node must retain its file path and source-location metadata.

#### Expected result

A user query is resolved to one clear target or the system clearly reports that it cannot choose safely.

---

### Day 3 - Adaptive Context Expansion

#### Study

Learn when each relationship is useful:

- `CALLS`: direct implementation dependencies
- `IMPORTS`: external or file-level dependencies
- `REFERENCES`: symbols used by or connected to the target
- `EXTENDS`: inherited behavior
- `IMPLEMENTS`: interface contracts
- `CONTAINS`: structural ownership, usually used for lookup rather than broad context expansion

#### Build

Extend basic traversal so that each selected node records:

- The node itself
- Traversal depth
- The relationship that caused inclusion
- The edge that connected it

Always include the target at depth `0` and avoid revisiting nodes.

#### Expected result

The planner returns relevant connected symbols with enough metadata to explain why each symbol was selected.

---

### Day 4 - Relevance and Stopping Logic

#### Study

The first relationship-priority order is:

1. `CALLS`
2. `IMPORTS`
3. `REFERENCES`
4. `EXTENDS` and `IMPLEMENTS` when useful

Also study:

- Maximum depth
- Early stopping
- Cycle prevention
- Avoiding unrelated branches
- Keeping the result smaller than unrestricted traversal

#### Build

Use a configurable maximum depth with a default of `3`.

Stop when:

- The maximum depth is reached.
- No new relevant nodes remain.
- A node has already been visited.

#### Expected result

The planner produces focused context instead of the whole repository graph.

---

### Day 5 - Context Planning Engine

#### Study

Combine all previous work into one workflow:

1. Accept a user query.
2. Resolve the target symbol.
3. Expand relevant relationships.
4. Apply depth and stopping rules.
5. Return the selected context.

#### Build

Create a planner API that returns:

- The original query
- Resolution status
- Target node
- Ambiguous candidates
- Selected symbol IDs
- Selected nodes
- Selected relationships
- Traversal depth and relationship metadata
- Maximum depth

#### Example output

```json
{
  "query": "Modify loginUser() logic",
  "status": "matched",
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

#### Expected result

A working Adaptive Context Planner that produces a minimal symbol list for the context extractor or LLM.

---

## Final Developer 2 Success Scenario

```text
User query
    |
    v
Target node: loginUser()
    |
    +-- CALLS --> verifyPassword()
    +-- CALLS --> generateToken()
    +-- REFERENCES --> UserModel
    |
    v
Selected symbol IDs
    |
    v
Minimal context package
```

## Definition of Done

By the end of Week 2, Developer 2 can:

1. Load Developer 1's repository-analysis JSON.
2. Build a valid graph of files, symbols, and relationships.
3. Resolve a natural-language query to a target symbol.
4. Report ambiguous and missing targets clearly.
5. Expand only relevant connected nodes.
6. Apply relationship priority and a configurable depth limit.
7. Prevent cycles and duplicate context.
8. Return selected symbol IDs and source metadata for context extraction.

## Preparation Checklist

- [ ] Explain nodes, edges, directed graphs, BFS, and DFS.
- [ ] Memorize the shared node and relationship types.
- [ ] Understand how `InMemoryGraph` stores and retrieves data.
- [ ] Practice each graph query operation.
- [ ] Trace a depth-based expansion by hand.
- [ ] Practice resolving descriptive queries to symbols.
- [ ] Understand matched, ambiguous, and not-found results.
- [ ] Explain why relationship priority reduces irrelevant context.
- [ ] Trace a complete `loginUser()` planning example.
- [ ] Verify that selected symbol IDs can be passed to the context extractor.
