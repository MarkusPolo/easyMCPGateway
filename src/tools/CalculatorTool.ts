import { BaseTool } from "./BaseTool";
import { ToolResponse } from "./types";

export class CalculatorTool extends BaseTool {
    name = "calculator";
    description = "A basic calculator that can perform addition, subtraction, multiplication, and division.";
    category = "Mathematics";

    inputSchema = {
        properties: {
            operation: {
                type: "string",
                enum: ["add", "subtract", "multiply", "divide"],
                description: "The operation to perform"
            },
            a: {
                type: "number",
                description: "First number"
            },
            b: {
                type: "number",
                description: "Second number"
            }
        },
        required: ["operation", "a", "b"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { operation, a, b } = args as { operation: string; a: number; b: number };

        if (typeof a !== 'number' || typeof b !== 'number') {
            return {
                content: [{ type: "text", text: "Invalid arguments: 'a' and 'b' must be numbers." }],
                isError: true
            };
        }

        let result: number;

        switch (operation) {
            case "add":
                result = a + b;
                break;
            case "subtract":
                result = a - b;
                break;
            case "multiply":
                result = a * b;
                break;
            case "divide":
                if (b === 0) {
                    return {
                        content: [{ type: "text", text: "Error: Division by zero." }],
                        isError: true
                    };
                }
                result = a / b;
                break;
            default:
                return {
                    content: [{ type: "text", text: `Unknown operation: ${operation}` }],
                    isError: true
                };
        }

        return {
            content: [{ type: "text", text: `The result of ${a} ${operation} ${b} is ${result}` }]
        };
    }
}
