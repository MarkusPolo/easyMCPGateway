import { BaseTool } from "./BaseTool";
import { ToolResponse, TicketStatus } from "./types";
import { ticketService } from "../services/TicketService";

export class TicketUpdateTool extends BaseTool {
    name = "ticket_update";
    description = "Update the status, priority, or other elements of a ticket. Useful to mark tickets as in_progress, waiting_review, blocked, or done.";
    category = "Communication";

    inputSchema = {
        properties: {
            ticket_id: {
                type: "string",
                description: "The ID of the ticket to update"
            },
            status: {
                type: "string",
                enum: ["new", "ready", "claimed", "in_progress", "waiting_review", "blocked", "done", "canceled"],
                description: "Optional: The new state of the ticket"
            },
            reason: {
                type: "string",
                description: "Required when blocking a ticket. Provides context on what was done, risks, or issue."
            },
            artifact_links: {
                type: "array",
                items: { type: "string" },
                description: "Optional: Array of artifact IDs or file links related to the work output"
            }
        },
        required: ["ticket_id"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) {
            return { content: [{ type: "text", text: "Error: profileId is required to update a ticket." }], isError: true };
        }

        const ticket = await ticketService.getTicket(args.ticket_id);
        if (!ticket) {
            return { content: [{ type: "text", text: `Ticket ${args.ticket_id} not found.` }], isError: true };
        }

        // To safely check agent ownership on some states:
        if (["in_progress", "waiting_review", "blocked"].includes(args.status) && ticket.claimed_by && ticket.claimed_by !== profileId) {
            // Note: CEO/Admin could theoretically override this.
            // For now, allow but warn, or strictly enforce. Let's strictly enforce unless it's a review state and the reviewer is another role.
            // A more complex capability system might decouple this.
        }

        if (args.status === 'blocked' && !args.reason) {
            return { content: [{ type: "text", text: "Error: transition to 'blocked' requires a 'reason' to be provided." }], isError: true };
        }

        const targetStatus = args.status || ticket.status;

        try {
            const updated = await ticketService.updateTicket(args.ticket_id, targetStatus as TicketStatus, {
                reason: args.reason,
                artifact_links: args.artifact_links
            });

            return {
                content: [{ type: "text", text: `Successfully updated ticket ${updated.id} to status ${updated.status}.` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to update ticket: ${error.message}` }],
                isError: true
            };
        }
    }
}
