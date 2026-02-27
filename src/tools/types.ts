export interface ToolDefinition {
    name: string;
    description: string;
    category?: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface ToolResponse {
    content: Array<{
        type: "text" | "image" | "resource";
        text?: string;
        data?: string;
        mimeType?: string;
        resource?: { uri: string; mimeType?: string; text?: string; blob?: string };
    }>;
    isError?: boolean;
}

export interface ITool {
    category: string;
    definition(): ToolDefinition;
    execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse>;
}
