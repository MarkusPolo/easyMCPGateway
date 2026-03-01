import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class HledgerLockTool extends BaseTool {
    name = "hledger_lock_period";
    description = "Set a lock date. Transactions on or before this date cannot be modified or added.";
    category = "Accounting";

    inputSchema = {
        properties: {
            lockDate: {
                type: "string",
                description: "The lock date (YYYY-MM-DD). Use 'none' to unlock."
            }
        },
        required: ["lockDate"]
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const lockDate = args.lockDate;
        const settingsPath = path.resolve(process.cwd(), 'data/accounting/settings.json');

        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }

        if (lockDate.toLowerCase() === 'none') {
            delete settings.lockDate;
        } else {
            // Basic validation
            if (!/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) {
                return {
                    content: [{ type: "text", text: "Invalid date format. Use YYYY-MM-DD." }],
                    isError: true
                };
            }
            settings.lockDate = lockDate;
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        return {
            content: [{
                type: "text",
                text: lockDate.toLowerCase() === 'none'
                    ? "Period successfully unlocked."
                    : `Period successfully locked up to ${lockDate}.`
            }]
        };
    }
}
