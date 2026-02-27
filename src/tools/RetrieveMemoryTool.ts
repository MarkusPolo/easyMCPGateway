import { BaseTool } from "./BaseTool";
import { ToolResponse } from "./types";
import { memoryService } from "../utils/MemoryService";

export class RetrieveMemoryTool extends BaseTool {
    name = "retrieve_memory";
    description = "Search and retrieve relevant information from the agent's long-term memory based on a query.";
    category = "Memory";

    inputSchema = {
        properties: {
            query: {
                type: "string",
                description: "The search query to find relevant memories"
            },
            limit: {
                type: "number",
                description: "Maximum number of memories to retrieve (default: 5)",
                default: 5
            }
        },
        required: ["query"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { query, limit } = args as { query: string; limit?: number };

        if (!profileId) {
            return {
                content: [{ type: "text", text: "Error: No profile ID provided for memory retrieval." }],
                isError: true
            };
        }

        try {
            const results = await memoryService.query(profileId, query, limit || 5);

            if (results.length === 0) {
                return {
                    content: [{ type: "text", text: "No relevant memories found." }]
                };
            }

            const formattedResults = results.map((res, i) =>
                `Result ${i + 1}:\nContent: ${res.text}\nMetadata: ${JSON.stringify(res.metadata)}\nRelevance Score: ${res.distance.toFixed(4)}`
            ).join("\n\n---\n\n");

            return {
                content: [{ type: "text", text: `Relevant memories found:\n\n${formattedResults}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to retrieve memory: ${error.message}` }],
                isError: true
            };
        }
    }
}
