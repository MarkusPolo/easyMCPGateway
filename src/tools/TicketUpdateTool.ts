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

    private readonly allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
        new: ["ready", "canceled"],
        ready: ["canceled"],
        claimed: ["in_progress", "blocked", "ready", "canceled"],
        in_progress: ["waiting_review", "blocked", "ready", "canceled"],
        blocked: ["in_progress", "waiting_review", "canceled"],
        waiting_review: ["in_progress", "done", "blocked"],
        done: [],
        canceled: []
    };

    private isCeoOrAdmin(profileId: string): boolean {
        const normalized = profileId.toLowerCase();
        return normalized.includes("ceo") || normalized.includes("admin");
    }

    private isReviewer(profileId: string): boolean {
        const normalized = profileId.toLowerCase();
        return normalized.includes("review") || normalized.includes("reviewer") || normalized.includes("qa");
    }

    private canTransition(from: TicketStatus, to: TicketStatus): boolean {
        if (from === to) return true;
        return this.allowedTransitions[from]?.includes(to) ?? false;
    }

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) {
            return { content: [{ type: "text", text: "Error: profileId is required to update a ticket." }], isError: true };
        }

        const ticket = await ticketService.getTicket(args.ticket_id);
        if (!ticket) {
            return { content: [{ type: "text", text: `Ticket ${args.ticket_id} not found.` }], isError: true };
        }

        const targetStatus = (args.status || ticket.status) as TicketStatus;
        const isOverride = this.isCeoOrAdmin(profileId);
        const isReviewer = this.isReviewer(profileId);

        if (!isOverride && !this.canTransition(ticket.status, targetStatus)) {
            return {
                content: [{
                    type: "text",
                    text: `Error: invalid transition ${ticket.status} -> ${targetStatus}.`
                }],
                isError: true
            };
        }

        const reviewerCompletion = ticket.status === "waiting_review" && targetStatus === "done" && isReviewer;
        const ownsTicket = !!ticket.claimed_by && ticket.claimed_by === profileId;
        const requesterGrooming =
            !ticket.claimed_by &&
            ticket.requested_by === profileId &&
            ["new", "ready", "canceled"].includes(targetStatus);

        if (!isOverride && !reviewerCompletion && !ownsTicket && !requesterGrooming) {
            const ownerText = ticket.claimed_by ? `claimed by '${ticket.claimed_by}'` : "currently unclaimed";
            return {
                content: [{
                    type: "text",
                    text: `Error: ownership violation. Ticket is ${ownerText}. Only owner can update; reviewer may only do waiting_review -> done; CEO/Admin may override.`
                }],
                isError: true
            };
        }

        if (args.status === 'blocked' && !args.reason) {
            return { content: [{ type: "text", text: "Error: transition to 'blocked' requires a 'reason' to be provided." }], isError: true };
        }

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
