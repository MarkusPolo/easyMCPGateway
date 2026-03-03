import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { artifactStoreService } from '../services/ArtifactStoreService';
import { ticketService } from '../services/TicketService';

export class ArtifactStoreTool extends BaseTool {
    name = 'artifact_store';
    description = 'Store artifact bytes or text into a bucket and optionally attach it to a ticket.';
    category = 'Communication';

    inputSchema = {
        properties: {
            bucket: { type: 'string', description: 'Bucket namespace, e.g. design-assets or reports.' },
            ticket_id: { type: 'string', description: 'Optional ticket ID this artifact belongs to.' },
            type: { type: 'string', description: 'Artifact type, e.g. report, patch, image/png.' },
            mime_type: { type: 'string', description: 'MIME type, e.g. image/png, text/markdown.' },
            filename: { type: 'string', description: 'Preferred filename (optional).' },
            content_text: { type: 'string', description: 'Text payload to store.' },
            content_base64: { type: 'string', description: 'Binary payload encoded as base64.' },
            metadata: { type: 'object', description: 'Optional metadata object.' }
        },
        required: ['type']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const producer = profileId || 'unknown-worker';

        try {
            const artifact = await artifactStoreService.putArtifact({
                bucket: args.bucket,
                ticket_id: args.ticket_id,
                produced_by: producer,
                type: args.type,
                mime_type: args.mime_type,
                content_text: args.content_text,
                content_base64: args.content_base64,
                filename: args.filename,
                metadata: args.metadata || {}
            });

            if (args.ticket_id) {
                const ticket = await ticketService.getTicket(args.ticket_id);
                if (ticket) {
                    const links = [...(ticket.artifact_links || []), artifact.id];
                    await ticketService.updateTicket(args.ticket_id, ticket.status, { artifact_links: links }, { actorId: profileId, isPrivileged: !profileId });
                }
            }

            return {
                content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to store artifact: ${error.message}` }],
                isError: true
            };
        }
    }
}
