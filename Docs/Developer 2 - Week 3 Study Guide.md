# Developer 2 — Week 3 Architecture & Implementation Roadmap
## Deterministic MCP Server & Safe Patching Engine (Zero Internal LLM Overhead)

---

## 1. 📌 Architectural Correction & Week 3 Objectives

### Why We Removed the Internal LLM from the MCP Server

In earlier planning, it was proposed that the MCP server would call an internal LLM (via Groq or OpenAI APIs) to understand queries, select lines, and generate diffs. **This was an anti-pattern for three reasons:**

1. **The Client is Already an LLM**: When a developer connects an MCP server to **Claude Desktop, Cursor, Antigravity, or Copilot**, that client *is already a state-of-the-art Large Language Model*. Having an MCP server call a second LLM creates redundant latency, extra API costs, and fragile prompt-in-prompt orchestration.
2. **Deterministic Context Selection is Superior**: Through **SAGE v2**, we have proven that deterministic code retrieval achieves **100% target accuracy** in **~30ms** without any LLM token consumption.
3. **Role of an MCP Server**: Under the Model Context Protocol, the MCP server is a **tool and context provider**. Its job is to provide clean, exact code context to the host AI, and execute actions (like applying verified diffs with safety backups) on local files.

---

## 2. 🔍 Audit: Where LLMs Were Previously Planned vs. SAGE Solution

| Pipeline Stage | Old Legacy Plan (LLM-Dependent) | Current SAGE Solution (100% Deterministic) | Benefits |
| :--- | :--- | :--- | :--- |
| **1. Intent & Action Classification** | LLM prompt to classify intent (`fix`, `modify`, `explain`) | `QuerySignal.extractAction()` deterministic rule matrix | Instant execution, 0ms latency, 0 tokens |
| **2. Target Symbol Selection** | LLM text search / embeddings | `TargetResolver` with strict P1–P8 priority ordering & disambiguation | **100% target accuracy**, never hallucinates |
| **3. Exact Line Pinning** | Sending broad files to LLM to find line numbers | `LineResolver` pinning to cursor lines, crash frames & AST control blocks | Sub-function precision, exact statement lines |
| **4. Context Assembly** | LLM-based context summarization | `ContextAssembler` with token budget & graph edge dependency tracking | **81% context reduction**, preserves target |
| **5. Patch Generation** | Internal Groq/OpenAI API call inside MCP server | **External AI Assistant** (Claude/Cursor) generates patch using SAGE context | No extra API keys, no double billing |
| **6. Patch Application** | Blind string replacement | `PatchValidator` + `PatchApplier` with atomic backups & auto-rollback | Zero file corruption, 100% reversible |

---

## 3. 🔄 Redesigned End-to-End System Flow

```text
                       DEVELOPER IN IDE
                              │
                              ▼
        HOST AI ASSISTANT (Claude Desktop / Cursor / Antigravity)
                              │
                    (STDIO / MCP Protocol)
                              ▼
                ╔════════════════════════════════╗
                ║        AGCP MCP SERVER         ║
                ║     (Zero Internal LLM)        ║
                ╚════════════════════════════════╝
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [ TOOL: get_context ]        [ TOOL: apply_patch ]
               │                             │
               ▼                             ▼
        [ SAGE v2 Engine ]            [ Patch Validator ]
     - Workspace / Cursor Signal    - Hunk syntax check
     - Priority Target Resolver     - Line count & target match
     - Bounded Max-Propagation               │
     - Exact Line Resolver                   ▼
               │                     [ Backup Manager ]
               ▼                    - Snapshot to .agcp/backups/
        Minimal Context Plan                 │
        (Target + Exact Lines                ▼
         + Dependencies)             [ Atomic Applier ]
               │                    - In-memory line replacement
               │                    - Rollback on failure
               │                             │
               └──────────────┬──────────────┘
                              ▼
                     Host AI Assistant
               (Generates unified diff or
                presents solution to user)
```

---

## 4. 📅 Redesigned Day-by-Day Roadmap for Week 3

### Day 1 — SAGE-Powered MCP Server Integration
- **Concept**: Set up `@modelcontextprotocol/sdk` using the STDIO transport.
- **Implementation**:
  - `src/mcp/server.ts`: Registers standard tool `get_context`.
  - Tool arguments: `{ query: string, activeFile?: string, cursorLine?: number, openFiles?: string[], errors?: string, diff?: string }`.
  - Connects directly to SAGE `executePlanPipeline()`.
  - Returns structured `ContextPlan` containing primary target, exact line ranges, and supporting code.
- **Deliverable**: Working MCP server testable via MCP Inspector or Claude Desktop.

---

### Day 2 — Unified Diff Parser & Patch Validator
- **Concept**: Validate diff format, hunk line numbers, and original content alignment before touching any files.
- **Implementation**:
  - `src/patch/PatchValidator.ts`:
    - Parses unified diff blocks (`--- a/path`, `+++ b/path`, `@@ -oldStart,oldLen +newStart,newLen @@`).
    - Verifies that referenced files exist on disk.
    - Verifies that lines marked with `-` (deletions) match the actual source file content exactly.
    - Checks that line offsets are valid.
- **Deliverable**: Unit tests asserting valid and invalid patch detection.

---

### Day 3 — Atomic Patch Applier & Backup Manager
- **Concept**: Perform all file edits atomically with automatic snapshot backups and one-click rollback.
- **Implementation**:
  - `src/patch/BackupManager.ts`:
    - Copies targeted files to `.agcp/backups/<timestamp>/` prior to modification.
    - Maintains a backup manifest.
  - `src/patch/PatchApplier.ts`:
    - Applies verified hunks in-memory line-by-line.
    - Atomically writes new content to disk.
    - Automatically triggers rollback if any write error occurs.
- **Deliverable**: Safe patch applier with verified rollback capabilities.

---

### Day 4 — Compilation Verifier & MCP Tool Registration
- **Concept**: Expose patch validation and application tools to the MCP server with automatic compilation verification.
- **Implementation**:
  - `src/patch/PatchVerifier.ts`:
    - Runs static compiler checks (`tsc --noEmit` or language build commands) after patch application.
    - Automatically reverts patch if compilation errors are introduced.
  - Expose tools on MCP Server:
    - `validate_patch`: Checks if a proposed diff will apply cleanly without modifying files.
    - `apply_patch`: Creates backup, applies diff, verifies build, and returns diff summary.
    - `rollback_patch`: Restores files from the latest snapshot.
- **Deliverable**: 4 core MCP tools fully registered and operational.

---

### Day 5 — End-to-End Workflow & Client Verification
- **Concept**: Test the complete loop with real MCP clients (Claude Desktop, Cursor, Antigravity).
- **Implementation**:
  - Create sample queries:
    1. Vague prompt with cursor -> `get_context` -> Host AI writes diff -> `apply_patch` -> Verified.
    2. Stack trace error -> `get_context` -> Host AI proposes fix -> `apply_patch` -> Verified.
  - Add client configuration guide in `Docs/MCP-Client-Setup.md`.
- **Deliverable**: Production-ready MCP server meeting all Week 3 milestones.

---

## 5. 🛠️ MCP Tools Specification (Week 3 Final)

| Tool Name | Parameters | Returns | Role |
| :--- | :--- | :--- | :--- |
| **`get_context`** | `query`, `activeFile?`, `cursorLine?`, `openFiles?`, `errors?`, `diff?` | `ContextPlan` (target, line ranges, code, dependencies, status) | Provides deterministic minimal code context via SAGE |
| **`validate_patch`** | `patch` (unified diff string) | `{ valid: boolean, errors?: string[], affectedFiles: string[] }` | Dry-run verification of patch syntax and line matching |
| **`apply_patch`** | `patch` (unified diff string), `verifyBuild?: boolean` | `{ success: boolean, modifiedFiles: string[], backupPath: string }` | Atomically applies patch with automatic snapshot backup |
| **`rollback_patch`** | `backupPath?` (optional, defaults to latest) | `{ success: boolean, restoredFiles: string[] }` | Instant restoration of pre-patch file state |

---

## 6. 🏆 Week 3 Definition of Done

By the end of Week 3:
1. The AGCP MCP server runs over STDIO without needing any third-party AI API keys (`GROQ_API_KEY` / `OPENAI_API_KEY` are **not required**).
2. The host AI assistant connects via standard MCP config.
3. When the user asks a question, the host assistant calls `get_context` and receives the exact line ranges and target function in <30ms.
4. When the host assistant suggests a code modification, it calls `apply_patch` to safely update the local workspace with automated backup and rollback protection.

