import { HledgerBaseTool } from './HledgerBaseTool';
import { ToolResponse } from './types';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class HledgerAddTool extends HledgerBaseTool {
    name = "hledger_add";
    description = "Add a new transaction to the journal (useful for saving invoices or logging expenses). Features idempotency checks.";

    inputSchema = {
        properties: {
            date: {
                type: "string",
                description: "Transaction date (YYYY-MM-DD). Defaults to today if omitted."
            },
            description: {
                type: "string",
                description: "Transaction description/payee."
            },
            postings: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        account: { type: "string", description: "Account name (e.g., assets:bank, expenses:food)." },
                        amount: { type: "string", description: "Amount with currency (e.g., $50, 20 EUR). Optional if it can be inferred." }
                    },
                    required: ["account"]
                },
                description: "List of postings (at least two recommended for balanced transactions)."
            },
            externalId: {
                type: "string",
                description: "Optional idempotency key (e.g., invoice number). Prevents duplicate posting."
            },
            tags: {
                type: "array",
                items: { type: "string" },
                description: "Optional tags to add (e.g., 'pending', 'tax:20%')."
            },
            artifactId: {
                type: "string",
                description: "Optional ID of a saved artifact (receipt/invoice)."
            }
        },
        required: ["description", "postings"]
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const date = args.date || new Date().toISOString().split('T')[0];
        const description = args.description;
        const postings = args.postings as any[];
        const tags = args.tags || [];
        const artifactId = args.artifactId;
        const externalId = args.externalId;

        // Idempotency check
        if (externalId) {
            const existing = this.findTransactionById(externalId);
            if (existing.found) {
                return {
                    content: [{
                        type: "text",
                        text: `Transaction with externalId '${externalId}' already exists. Returning existing entry:\n\n${existing.raw}`
                    }]
                };
            }
        }

        // Generate internal ID for audit trail
        const internalId = crypto.randomUUID();

        // Check if period is locked
        const lockStatus = this.isLocked(date);
        if (lockStatus.locked) {
            return {
                content: [{ type: "text", text: `Cannot add transaction: ${lockStatus.reason}` }],
                isError: true
            };
        }

        if (postings.length < 1) {
            return {
                content: [{ type: "text", text: "At least one posting is required." }],
                isError: true
            };
        }

        // Add IDs to tags
        tags.push(`id:${internalId}`);
        if (externalId) {
            tags.push(`ext:${externalId}`);
        }

        // Add artifact ID to tags if provided
        if (artifactId) {
            tags.push(`doc:${artifactId}`);
        }

        // Construct hledger transaction string
        let entry = `${date} ${description}`;
        if (tags.length > 0) {
            entry += `  ; ${tags.join(', ')}`;
        }
        entry += '\n';

        for (const p of postings) {
            entry += `    ${p.account}${p.amount ? `  ${p.amount}` : ''}\n`;
        }
        entry += '\n';

        const journalPath = this.getJournalPath();
        try {
            fs.appendFileSync(journalPath, entry, 'utf-8');
            return {
                content: [{ type: "text", text: `Successfully added transaction to ${journalPath}:\n\n${entry}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to write to journal: ${error.message}` }],
                isError: true
            };
        }
    }
}
