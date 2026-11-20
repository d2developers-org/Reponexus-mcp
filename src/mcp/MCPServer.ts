import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { executePlanPipeline } from "../graph/planContext";
import { PatchValidator } from "../patch/PatchValidator";
import { BackupManager } from "../patch/BackupManager";
import { PatchApplier } from "../patch/PatchApplier";
import { PatchVerifier } from "../patch/PatchVerifier";
import type { QueryInput } from "../graph/types";

// Load environment variables
dotenv.config();

export class AGCPMCPServer {
  private server: Server;
  private repoRoot: string;

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = repoRoot;
    this.server = new Server(
      { name: "agcp-mcp-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  // ─── Tool Registry ────────────────────────────────────────────────────────

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_context",
          description:
            "Returns the minimal, deterministic code context required for a user request. " +
            "Uses the SAGE pipeline (signal collection → target resolution → activation propagation → line resolution) " +
            "to identify exactly which code regions are relevant — no LLM involved.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The user's natural language request (e.g. 'fix the auth token refresh bug').",
              },
              activeFile: {
                type: "string",
                description: "Absolute or repo-relative path of the file currently open in the editor.",
              },
              cursorLine: {
                type: "number",
                description: "1-indexed line number where the cursor is positioned.",
              },
              openFiles: {
                type: "array",
                items: { type: "string" },
                description: "List of all files currently open in the editor.",
              },
              errors: {
                type: "string",
                description: "Any error messages or stack traces related to the request.",
              },
              diff: {
                type: "string",
                description: "Unified diff of recent changes (output of `git diff`).",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "validate_patch",
          description:
            "Dry-runs a unified diff patch against the repository WITHOUT writing to disk. " +
            "Returns a list of validation errors (mismatched context lines, missing files, etc.) " +
            "or confirms the patch is safe to apply.",
          inputSchema: {
            type: "object",
            properties: {
              patch: {
                type: "string",
                description: "A unified diff string (output of `git diff` or `diff -u`).",
              },
            },
            required: ["patch"],
          },
        },
        {
          name: "apply_patch",
          description:
            "Applies a unified diff patch to the repository. " +
            "Before writing, creates a timestamped backup in `.agcp/backups/`. " +
            "After writing, runs `tsc --noEmit` to verify no type errors were introduced. " +
            "Automatically rolls back the patch if verification fails.",
          inputSchema: {
            type: "object",
            properties: {
              patch: {
                type: "string",
                description: "A unified diff string to apply.",
              },
            },
            required: ["patch"],
          },
        },
        {
          name: "rollback_patch",
          description:
            "Restores files from the most recent (or a specified) `.agcp/backups/` snapshot. " +
            "Use this if a patch was applied but you want to undo the changes.",
          inputSchema: {
            type: "object",
            properties: {
              backupId: {
                type: "string",
                description:
                  "Timestamp folder name inside `.agcp/backups/` (e.g. `2024-01-15T10-30-00-000Z`). " +
                  "Omit to roll back the most recent backup.",
              },
            },
            required: [],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "get_context":    return this.handleGetContext(args);
        case "validate_patch": return this.handleValidatePatch(args);
        case "apply_patch":    return this.handleApplyPatch(args);
        case "rollback_patch": return this.handleRollbackPatch(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  // ─── Tool Handlers ────────────────────────────────────────────────────────

  private async handleGetContext(args: Record<string, unknown> | undefined) {
    const input: QueryInput = {
      query:      String(args?.query ?? ""),
      activeFile: args?.activeFile  ? String(args.activeFile)  : undefined,
      cursorLine: args?.cursorLine  ? Number(args.cursorLine)  : undefined,
      openFiles:  Array.isArray(args?.openFiles)
                    ? (args!.openFiles as unknown[]).map(String)
                    : undefined,
      errors:     args?.errors ? String(args.errors) : undefined,
      diff:       args?.diff   ? String(args.diff)   : undefined,
    };

    try {
      const plan = executePlanPipeline(input, this.repoRoot);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status:         plan.status,
            action:         plan.action,
            target:         plan.target,
            regions:        plan.regions,
            code:           plan.code,
            dependencies:   plan.dependencies,
            truncated:      plan.truncated,
            signalSummary:  plan.signalSummary,
          }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ status: "error", message: error.message }) }],
        isError: true,
      };
    }
  }

  private async handleValidatePatch(args: Record<string, unknown> | undefined) {
    const patch = String(args?.patch ?? "");

    try {
      const validator = new PatchValidator(this.repoRoot);
      const result = validator.validate(patch);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ valid: false, errors: [error.message], affectedFiles: [] }) }],
        isError: true,
      };
    }
  }

  private async handleApplyPatch(args: Record<string, unknown> | undefined) {
    const patch = String(args?.patch ?? "");

    try {
      // 1. Validate first
      const validator = new PatchValidator(this.repoRoot);
      const validation = validator.validate(patch);
      if (!validation.valid) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: false, reason: "Patch validation failed", errors: validation.errors }),
          }],
        };
      }

      // 2. Backup affected files
      const backup = new BackupManager(this.repoRoot);
      const backupPath = backup.createSnapshot(validation.affectedFiles);

      // 3. Apply the patch
      const applier = new PatchApplier(this.repoRoot);
      const modifiedFiles = applier.apply(patch);

      // 4. Verify (tsc --noEmit); auto-rollback on failure
      const verifier = new PatchVerifier(this.repoRoot);
      const verifyResult = verifier.verify();

      if (!verifyResult.success) {
        backup.restore(backupPath);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              reason: "Type-check failed after patch — changes rolled back automatically",
              errors: verifyResult.errors,
              backupPath,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, modifiedFiles, backupPath }, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, reason: error.message }) }],
        isError: true,
      };
    }
  }

  private async handleRollbackPatch(args: Record<string, unknown> | undefined) {
    const backupId = args?.backupId ? String(args.backupId) : undefined;

    try {
      const backup = new BackupManager(this.repoRoot);
      const result = backup.restoreLatest(backupId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, reason: error.message }) }],
        isError: true,
      };
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[AGCP] MCP Server running on stdio");
  }
}
