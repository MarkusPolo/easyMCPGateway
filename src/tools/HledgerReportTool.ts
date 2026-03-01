import { HledgerBaseTool } from './HledgerBaseTool';
import { ToolResponse } from './types';

export class HledgerReportTool extends HledgerBaseTool {
    name = "hledger_report";
    description = "Generate various hledger reports (balance, register, print).";

    inputSchema = {
        properties: {
            command: {
                type: "string",
                enum: ["bal", "reg", "print", "bs", "is"],
                description: "The hledger report command to run (bal: balance, reg: register, print: raw, bs: balance sheet, is: income statement)."
            },
            args: {
                type: "array",
                items: { type: "string" },
                description: "Additional arguments/filters (e.g., account names, date filters like 'since yesterday', tags)."
            }
        },
        required: ["command"]
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const command = args.command;
        const extraArgs = args.args || [];

        return this.runHledger([command, ...extraArgs]);
    }
}
