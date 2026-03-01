import { BaseTool } from "./BaseTool";
import { ToolResponse, TicketCategory } from "./types";
import { ticketService } from "../services/TicketService";

export class TicketCreateTool extends BaseTool {
    name = "ticket_create";
    description = "Create a new ticket for a specific task. Used to delegate tasks to other agents.";
    category = "Communication";

    inputSchema = {
        properties: {
            title: {
                type: "string",
                description: "Short title of the ticket"
            },
            description: {
                type: "string",
                description: "Detailed description of the task"
            },
            category: {
                type: "string",
                enum: ["marketing", "finance", "code", "legal", "sales", "ops"],
                description: "The category of the ticket, which dictates the review workflow (e.g. Finance goes to Accountant, Code to Security)"
            },
            target_role_hint: {
                type: "string",
                description: "Optional hint for which role should claim this ticket"
            },
            planningMode: {
                type: "boolean",
                description: "Set to true if this ticket requires planning mode before execution"
            },
            priority: {
                type: "number",
                description: "Priority from 1 (lowest) to 10 (highest)"
            },
            acceptance_criteria: {
                type: "array",
                items: { type: "string" },
                description: "List of criteria that must be met for the ticket to be considered done"
            },
            dependencies: {
                type: "array",
                items: { type: "string" },
                description: "List of ticket IDs that must be completed before this one"
            }
        },
        required: ["title", "description", "category"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) {
            return { content: [{ type: "text", text: "Error: profileId is required to create a ticket." }], isError: true };
        }

        try {
            const ticket = await ticketService.createTicket({
                title: args.title,
                description: args.description,
                category: args.category as TicketCategory,
                target_role_hint: args.target_role_hint,
                planningMode: args.planningMode || false,
                priority: args.priority || 5,
                acceptance_criteria: args.acceptance_criteria || [],
                dependencies: args.dependencies || [],
                requested_by: profileId // Currently using profile ID directly as the proxy for profileName/ID
            });

            return {
                content: [{ type: "text", text: `Ticket successfully created with ID: ${ticket.id}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to create ticket: ${error.message}` }],
                isError: true
            };
        }
    }
}
