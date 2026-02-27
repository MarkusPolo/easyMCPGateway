import { ITool, ToolDefinition, ToolResponse } from "./types";

export abstract class BaseTool implements ITool {
    abstract name: string;
    abstract description: string;
    abstract category: string;
    abstract inputSchema: Record<string, any>;

    definition(): ToolDefinition {
        return {
            name: this.name,
            description: this.description,
            category: this.category,
            inputSchema: {
                type: "object",
                ...(this.inputSchema as any),
            },
        };
    }

    abstract execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse>;
}
