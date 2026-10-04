import { AGCPMCPServer } from "./MCPServer.js";

async function main() {
  const server = new AGCPMCPServer();
  try {
    await server.start();
  } catch (error) {
    console.error("Failed to start AGCP MCP Server:", error);
    process.exit(1);
  }
}

main();
