import { BaseTool } from "./BaseTool";
import { ToolResponse } from "./types";
import { ticketService } from "../services/TicketService";

export class TicketClaimTool extends BaseTool {
    name = "ticket_claim";
    description = "Claim a ready or expired ticket so that you can work on it.";
    category = "Communication";

    inputSchema = {
        properties: {
            ticket_id: {
                type: "string",
                description: "The ID of the ticket to claim"
            }
        },
        required: ["ticket_id"]
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) {
            return { content: [{ type: "text", text: "Error: profileId is required to claim a ticket." }], isError: true };
        }

        try {
            const ticket = await ticketService.claimTicket(args.ticket_id, profileId);
            return {
                content: [{
                    type: "text",
                    text: `Successfully claimed ticket ${ticket!.id}.\nYou are now assigned to it.\nDon't forget to update its status to in_progress or waiting_review when appropriate.`
                }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to claim ticket: ${error.message}` }],
                isError: true
            };
        }
    }
}
