import { HledgerBaseTool } from './HledgerBaseTool';
import { ToolResponse } from './types';
import * as fs from 'fs';
import { execSync } from 'child_process';

export class HledgerReverseTool extends HledgerBaseTool {
    name = "hledger_reverse_transaction";
    description = "Create a reversal (Storno) for an existing transaction.";
    category = "Accounting";

    inputSchema = {
        properties: {
            origTxId: {
                type: "string",
                description: "The unique ID of the original transaction to reverse (preferred over searchQuery)."
            },
            searchQuery: {
                type: "string",
                description: "Search string if origTxId is unknown (e.g., part of description)."
            },
            reversalDate: {
                type: "string",
                description: "Date for the reversal transaction (YYYY-MM-DD). Defaults to today."
            },
            reason: {
                type: "string",
                description: "Reason for the reversal."
            }
        },
        required: [] // Either origTxId or searchQuery should be provided logic-wise
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const origTxId = args.origTxId;
        const searchQuery = args.searchQuery;
        const reversalDate = args.reversalDate || new Date().toISOString().split('T')[0];
        const reason = args.reason || "Reversal of original transaction";

        if (!origTxId && !searchQuery) {
            return {
                content: [{ type: "text", text: "Either origTxId or searchQuery must be provided." }],
                isError: true
            };
        }

        // Check if reversal date is locked
        const lockStatus = this.isLocked(reversalDate);
        if (lockStatus.locked) {
            return {
                content: [{ type: "text", text: `Cannot reverse transaction: ${lockStatus.reason}` }],
                isError: true
            };
        }

        const hledgerPath = this.getHledgerPath();
        const journalPath = this.getJournalPath();

        try {
            // Determine search term
            let query = searchQuery;
            if (origTxId) {
                // Try searching by specific ID tags
                query = `tag:id=${origTxId}`;
            }

            // Use hledger print to get the original transaction in a parsable format
            const printCmd = `& "${hledgerPath}" -f "${journalPath}" print "${query.replace(/"/g, '\\"')}"`;
            console.error(`- Reversal Search Command: ${printCmd}`);
            const originalTx = execSync(printCmd, { shell: 'powershell.exe', encoding: 'utf-8' }).trim();

            if (!originalTx) {
                return {
                    content: [{ type: "text", text: `No transaction found matching: ${query}` }],
                    isError: true
                };
            }

            // Simple parser to invert amounts
            const lines = originalTx.split('\n');
            const header = lines[0];
            const postings = lines.slice(1);

            // Extract original ID for reference if not provided
            let referencedId = origTxId;
            if (!referencedId) {
                const idMatch = header.match(/id:([a-zA-Z0-9-]+)/);
                if (idMatch) referencedId = idMatch[1];
            }

            let reversal = `${reversalDate} Reversal: ${header.substring(11).split(';')[0].trim()}`;
            reversal += `  ; reason: ${reason}`;
            if (referencedId) {
                reversal += `, rev_of:${referencedId}`;
            }
            reversal += '\n';

            for (const line of postings) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Extract account and amount
                const match = line.match(/^(\s+)(.+?)(\s\s+.+)?$/);
                if (match) {
                    const indent = match[1];
                    const account = match[2];
                    const amount = match[3] ? match[3].trim() : null;

                    if (amount) {
                        let invertedAmount = amount;
                        if (amount.startsWith('-')) {
                            invertedAmount = amount.substring(1);
                        } else {
                            invertedAmount = '-' + amount;
                        }
                        reversal += `${indent}${account}  ${invertedAmount}\n`;
                    } else {
                        reversal += `${indent}${account}\n`;
                    }
                }
            }
            reversal += '\n';

            fs.appendFileSync(journalPath, reversal, 'utf-8');

            return {
                content: [{
                    type: "text",
                    text: `Successfully created reversal entry:\n\n${reversal}`
                }]
            };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to reverse transaction: ${error.message}` }],
                isError: true
            };
        }
    }
}
