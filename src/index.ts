import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToolManager } from "./ToolManager";
import { startAdminServer } from "./adminServer";

async function main() {
    const server = new Server(
        { name: "easy-mcp-gateway", version: "1.0.0" },
        { capabilities: { tools: {} } }
    );

    const toolManager = new ToolManager();
    await toolManager.loadTools();

    toolManager.registerWithMcp(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Start HTTP Admin interface on port 8080
    startAdminServer(toolManager, 8080);

    console.error("MCP Server running on stdio with dynamic tools structure.");
}

main().catch(console.error);
