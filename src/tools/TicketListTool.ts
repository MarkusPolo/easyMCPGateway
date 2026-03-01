import { BaseTool } from "./BaseTool";
import { ToolResponse } from "./types";
import { ticketService } from "../services/TicketService";

export class TicketListTool extends BaseTool {
    name = "ticket_list";
    description = "List available tickets that can be worked on, or tickets of a specific status.";
    category = "Communication";

    inputSchema = {
        properties: {
            status: {
                type: "string",
                enum: ["new", "ready", "claimed", "in_progress", "waiting_review", "blocked", "done", "canceled"],
                description: "Optional: Filter by ticket status (default is 'ready' to find work)"
            },
            category: {
                type: "string",
                description: "Optional: Filter by ticket category"
            },
            target_role_hint: {
                type: "string",
                description: "Optional: Filter by role hint"
            }
        }
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        try {
            const status = args.status || 'ready';
            const tickets = await ticketService.listTickets({
                status: status !== 'all' ? status : undefined,
                category: args.category,
                target_role_hint: args.target_role_hint
            });

            if (tickets.length === 0) {
                return {
                    content: [{ type: "text", text: `No tickets found matching the criteria.` }]
                };
            }

            const formatted = tickets.map(t =>
                `ID: ${t.id}\nTitle: ${t.title}\nCategory: ${t.category}\nPriority: ${t.priority}\nTarget Role: ${t.target_role_hint || 'Any'}\nStatus: ${t.status}\n---`
            ).join('\n');

            return {
                content: [{ type: "text", text: `Found ${tickets.length} tickets:\n\n${formatted}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to list tickets: ${error.message}` }],
                isError: true
            };
        }
    }
}
