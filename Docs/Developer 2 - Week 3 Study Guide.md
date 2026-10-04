# Developer 2 - Week 3 Study Guide & Roadmap
## LLM Integration, MCP Server & Patch Generation Engine

---

## 📌 Role & Week 3 Objective

In Week 1 and Week 2, Developer 2 built the **Graph & Context Planning Engine** (loading repo analysis into an in-memory directed graph, target symbol resolution, adaptive graph traversal, relationship prioritization, depth control, and context package building).

In **Week 3**, Developer 2 focuses on **LLM Integration & Code Patch Generation**:
1. **MCP Server Integration**: Expose AGCP capabilities (`getContext`, `generatePatch`) via standard Model Context Protocol (MCP).
2. **LLM Integration & Prompt Engineering**: Connect to Groq/OpenAI APIs, construct strict system prompts, and stream responses.
3. **Patch Generation & Validation**: Parse LLM responses into valid unified diffs (`.patch`) and validate format integrity.
4. **Patch Application & Rollback**: Safely apply generated patches to local repository files with automatic backup creation and conflict detection.
5. **End-to-End Pipeline**: Connect Developer 1's Query & Context Packaging output into Developer 2's LLM Patch Engine for a working prototype.

---

## 🔄 End-to-End Workflow (Week 3 Target)

```text
User Natural Language Query
          │
          ▼
[ Developer 1: Query Parser & Intent Mapper ]
          │
          ▼
[ Developer 1/2: Adaptive Graph Traversal & Context Selection ]
          │
          ▼
    Minimal Code Context Package
          │
          ▼
[ Developer 2: MCP Server / LLM Prompt Builder ]
          │ (Groq / OpenAI API call with unified diff instructions)
          ▼
[ Developer 2: LLM Output & Unified Diff Patch Generator ]
          │
          ▼
[ Developer 2: Patch Format Validator ]
          │
          ▼
[ Developer 2: Patch Applier with Backup & Rollback ]
          │
          ▼
Modified Files in Local Repository (with Backup Created)
```

---

## 📅 Day-by-Day Roadmap & Study Guide

### Day 1 - MCP Server Integration & API Client Setup

#### 🧠 Concepts to Study
- **Model Context Protocol (MCP)**: Server-Client architecture, JSON-RPC communication, STDIO and HTTP transports.
- **MCP Tools Specification**: How to define tool names, input schemas, and execution handlers.
- **API Provider Architecture**: Understanding OpenAI API format and Groq SDK (`groq-sdk`) for fast inference (`llama-3.3-70b-versatile`, `mixtral-8x7b`).

#### 🛠️ What to Build
- Initialize an MCP Server (`@modelcontextprotocol/sdk`).
- Register core tools:
  - `getContext`: Accepts user query, returns minimal code context package.
  - `generatePatch`: Accepts user query + code context, returns generated unified diff patch.
- Setup environment configurations for API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`).

#### 📐 Example Interface / Schema
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// MCP Server Setup
const server = new Server({
  name: "agcp-mcp-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// Tool Registration
server.tool(
  "getContext",
  "Fetches minimal code context for a query",
  { query: { type: "string" } },
  async (args) => { /* call graph planner & context extractor */ }
);

server.tool(
  "generatePatch",
  "Generates code patch diff from context",
  { query: { type: "string" }, context: { type: "object" } },
  async (args) => { /* call LLM & patch generator */ }
);
```

#### ✅ Expected Output
- Working MCP Server capable of receiving STDIO tool requests and responding with structured JSON output.

---

### Day 2 - LLM Integration & Prompt Engineering for Code Patching

#### 🧠 Concepts to Study
- **System Prompt Design**: Crafting instructions that force LLMs to output syntactically valid unified diffs without markdown conversational text.
- **Token Budget Management**: Truncating or summarizing context to prevent context window overflow.
- **Streaming & Error Handling**: Processing chunks as they arrive, handling API rate limits (429 errors), and exponential backoff retry.

#### 🛠️ What to Build
- `LLMClient.ts`: Abstraction layer over Groq/OpenAI with options for streaming, temperature (`0.1 - 0.2` for precise code generation), and model selection.
- `PromptBuilder.ts`: Formats the prompt by embedding target files, code snippets with start/end lines, and strict formatting guidelines.

#### 📐 System Prompt Blueprint
```text
You are an expert automated code modification agent.
Given a user request and context code snippets from the codebase, generate a precise UNIFIED DIFF patch.

RULES:
1. Output ONLY the unified diff block using standard `--- a/file` and `+++ b/file` syntax.
2. Include correct line numbers in hunk headers `@@ -start,count +start,count @@`.
3. Do not include markdown conversational filler outside of the diff block.
4. Ensure code formatting and indentation match the original source file exactly.
```

#### ✅ Expected Output
- LLM Client successfully queries LLM provider with structured context and streams generated patch code.

---

### Day 3 - Unified Diff & Patch Generation Engine

#### 🧠 Concepts to Study
- **Unified Diff Specification**:
  - File headers: `--- a/src/auth.ts`, `+++ b/src/auth.ts`
  - Hunk headers: `@@ -10,7 +10,7 @@`
  - Context lines (space prefix ` `), Deletions (minus `-`), Insertions (plus `+`).
- **Parsing LLM Outputs**: Extracting raw diff blocks from markdown blocks (```diff ... ```).
- **Hunk Validation**: Checking line numbers, line counts, and ensuring target original lines match actual source file content.

#### 🛠️ What to Build
- `PatchGenerator.ts`: Extracts unified diff text from LLM response, normalizes line endings, and creates `Patch` data structures.
- `PatchValidator.ts`: Verifies that file paths exist, line ranges are valid, and target text matches existing code before attempting file modification.

#### 📐 Example Patch Data Structure
```typescript
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface PatchPackage {
  query: string;
  patches: FilePatch[];
  rawDiff: string;
  isValid: boolean;
  errors?: string[];
}
```

#### ✅ Expected Output
- Validated patch object that accurately represents requested code edits with verified line ranges.

---

### Day 4 - Automated Patch Application & File Handling

#### 🧠 Concepts to Study
- **In-Memory Diff Application**: Applying diff hunks to string arrays line-by-line.
- **Atomic File Operations**: Creating temporary backups (`.agcp/backups/<timestamp>/`), writing modified content, and rolling back if any error occurs.
- **Conflict Handling**: Detecting when source code has changed or hunk lines don't align, failing safely without corrupting codebase.

#### 🛠️ What to Build
- `PatchApplier.ts`: Main module for applying patches to the file system.
- `BackupManager.ts`: Handles pre-patch backups and rollback actions on failure.

#### 📐 Safe Patch Application Workflow
```typescript
export async function applyPatch(options: {
  repoPath: string;
  patch: PatchPackage;
  createBackup: boolean;
}): Promise<{ success: boolean; modifiedFiles: string[]; backupPath?: string }> {
  // 1. Create snapshot backup of target files
  // 2. Validate all hunks against original file content
  // 3. Perform line-by-line patch replacement in memory
  // 4. Write updated content to files
  // 5. If any error occurs -> execute rollback from backup!
}
```

#### ✅ Expected Output
- Patch applier that modifies target files safely, maintains backups, and restores clean state if errors are detected.

---

### Day 5 - End-to-End Integration, Testing & Demo Preparation

#### 🧠 Concepts to Study
- **Full Pipeline Flow**: Connecting Query Engine (Dev 1) + Graph & Context Planner (Dev 1 & 2) + LLM & Patch Engine (Dev 2).
- **Evaluation Criteria**: Token consumption reduction vs full repo context, patch application success rate, response latency.
- **Demo Scripting**: Preparing deterministic sample queries and recording proof-of-concept execution.

#### 🛠️ What to Build & Test
- Integration runner (`src/index.ts` or `src/pipeline.ts`) executing complete end-to-end workflow:
  1. User inputs query: `"Modify loginUser to support Clerk authentication"`
  2. Dev 1 parses intent & Dev 1/2 extracts minimal context.
  3. Dev 2 sends query + context package to LLM.
  4. Dev 2 parses output into unified diff.
  5. Dev 2 applies diff to workspace with backup.
- Comprehensive sample query test suite.

#### ✅ Expected Output
- Working end-to-end prototype fulfilling Week 3 Definition of Done.

---

## 🏆 Week 3 Deliverables Checklist for Developer 2

| Deliverable | Description | Status |
| :--- | :--- | :---: |
| **MCP Server** | Server exposing `getContext` and `generatePatch` tools via STDIO | 🔲 Pending |
| **LLM Client** | API wrapper for Groq/OpenAI with streaming and rate-limit handling | 🔲 Pending |
| **Prompt Engineering** | System prompt forcing strict unified diff output without markdown noise | 🔲 Pending |
| **Patch Generator** | Parser converting raw LLM code outputs into structured diff objects | 🔲 Pending |
| **Patch Validator** | Verification module for hunk headers and line range matches | 🔲 Pending |
| **Patch Applier** | File applier with atomic write capabilities and backup manager | 🔲 Pending |
| **Rollback System** | Automatic restoration mechanism if patch application fails | 🔲 Pending |
| **E2E Integration** | Combined workflow execution with Developer 1's Query & Context Engine | 🔲 Pending |

---

## 🎯 Week 3 Definition of Done

By the end of Week 3, the combined team (Dev 1 + Dev 2) will have:
1. A user ask a natural language request (e.g., `"Update auth token expiration"`).
2. The AGCP engine identifies target symbols, traverses the graph, and packages minimal context.
3. Developer 2's LLM engine receives the context and produces a valid unified diff.
4. Developer 2's patch engine validates and applies the diff to the local codebase safely with automatic backup.
5. Verification commands demonstrate clean execution without manual file edits.
