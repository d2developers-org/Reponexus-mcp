import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { LLMClient } from "./LLMClient.js";
import { PromptBuilder, FileContext } from "./PromptBuilder.js";

// Load environment variables (like API keys)
dotenv.config();

export class AGCPMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "agcp-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: { tools: {} },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "getContext",
            description: "Fetches minimal code context for a given query using the AGCP Graph Planner.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The user's natural language query to find context for.",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "generatePatch",
            description: "Generates a unified diff patch based on a natural language query and provided code context.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The user's natural language query describing the desired code change.",
                },
                context: {
                  type: "object",
                  description: "The minimal code context package retrieved by getContext.",
                  additionalProperties: true
                },
              },
              required: ["query", "context"],
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "getContext") {
        const query = String(args?.query);
        // TODO (Day 3-5): Integrate with Developer 1/2's Graph & Context Planning Engine
        // Returning a mock response for Day 1
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query,
                status: "mock_success",
                message: "Context engine integration pending. This is a Day 1 mock response.",
                context: {
                  targetSymbols: ["mockSymbol"],
                  files: ["src/mock.ts"]
                }
              }),
            },
          ],
        };
      }

      if (name === "generatePatch") {
        const query = String(args?.query);
        const context = args?.context as { files?: FileContext[] }; // Assuming context payload has files
        
        try {
          // Initialize LLM Client
          const llmClient = new LLMClient();
          
          // Build prompts
          const systemPrompt = PromptBuilder.buildSystemPrompt();
          // Extract files from context, defaulting to empty array if missing
          const contextFiles = context?.files || [];
          const userPrompt = PromptBuilder.buildUserPrompt(query, contextFiles);
          
          // Call LLM
          const rawDiff = await llmClient.generatePatch(systemPrompt, userPrompt);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "success",
                  message: "Patch generated successfully",
                  rawDiff
                }),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "error",
                  message: error.message || "Failed to generate patch"
                }),
              },
            ],
            isError: true,
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  public async start() {
    // Setup STDIO transport for MCP
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("AGCP MCP Server running on stdio");
  }
}
