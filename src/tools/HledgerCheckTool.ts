import { HledgerBaseTool } from './HledgerBaseTool';
import { ToolResponse } from './types';

export class HledgerCheckTool extends HledgerBaseTool {
    name = "hledger_check";
    description = "Run hledger check to verify the integrity and consistency of the journal file.";

    inputSchema = {
        properties: {
            args: {
                type: "array",
                items: { type: "string" },
                description: "Optional additional check arguments."
            }
        }
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const extraArgs = args.args || [];
        const result = this.runHledger(["check", ...extraArgs]);

        if (!result.isError && result.content[0].text === "") {
            return {
                content: [{ type: "text", text: "Journal check passed successfully (no errors and no output)." }]
            };
        }
        return result;
    }
}
