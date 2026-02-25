import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import EventSource from 'eventsource';

// Define globals to patch `EventSource` for Node.js environment
global.EventSource = EventSource as any;

const EVENT_SOURCE_URL = "http://localhost:8080/mcp/sse";
const PROFILE_TOKEN = process.env.PROFILE_TOKEN;

async function main() {
    if (!PROFILE_TOKEN) {
        console.error("Please provide PROFILE_TOKEN environment variable.");
        process.exit(1);
    }

    console.log(`[Client] Connecting to ${EVENT_SOURCE_URL} using Bearer token...`);

    const transport = new SSEClientTransport(
        new URL(EVENT_SOURCE_URL),
        {
            eventSourceInit: { headers: { Authorization: `Bearer ${PROFILE_TOKEN}` } } as any,
            requestInit: { headers: { Authorization: `Bearer ${PROFILE_TOKEN}` } } as any
        }
    );

    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
    );

    await client.connect(transport);
    console.log("[Client] Successfully connected and initialized!");

    try {
        const response = await client.listTools();
        console.log(`\n[Client] Received ${response.tools.length} available tools exclusively for this Profile:`);

        response.tools.forEach(tool => {
            console.log(` - ${tool.name} (${tool.description})`);
        });

        console.log("\n[Client] Attempting to call an allowed tool (web_search for 'Testing Agent Charlie')...");

        const testResult = await client.callTool({
            name: "web_search",
            arguments: { query: "Testing Agent Charlie" }
        });

        console.log("[Client] Success! Result preview:");
        console.log(((testResult.content as any)[0] as any).text.substring(0, 500) + "...\n");

    } catch (e: any) {
        console.error("[Client] Failed to execute:", e.message);
    } finally {
        console.log("[Client] Holding connection open for 60 seconds so you can view it on the Web UI Active Connections Tab...");
        await new Promise(r => setTimeout(r, 60000));
        await transport.close();
        console.log("[Client] Connection closed.");
    }
}

main().catch(console.error);
