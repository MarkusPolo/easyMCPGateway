import { BaseTool } from "./BaseTool";
import { ToolResponse } from "./types";
import { memoryService } from "../utils/MemoryService";

export class StoreMemoryTool extends BaseTool {
    name = "store_memory";
    description = "Store a piece of information in the agent's long-term memory for later retrieval.";
    category = "Memory";

    inputSchema = {
        properties: {
            text: {
                type: "string",
                description: "The information to store"
            },
            metadata: {
                type: "object",
                description: "Optional metadata to associate with this memory",
                additionalProperties: true
            }
        },
        required: ["text"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { text, metadata } = args as { text: string; metadata?: Record<string, any> };

        if (!profileId) {
            return {
                content: [{ type: "text", text: "Error: No profile ID provided for memory storage." }],
                isError: true
            };
        }

        try {
            await memoryService.store(profileId, text, metadata || {});
            return {
                content: [{ type: "text", text: "Memory stored successfully." }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to store memory: ${error.message}` }],
                isError: true
            };
        }
    }
}
