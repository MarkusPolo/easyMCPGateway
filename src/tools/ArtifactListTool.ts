import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { artifactStoreService } from '../services/ArtifactStoreService';

export class ArtifactListTool extends BaseTool {
    name = 'artifact_list';
    description = 'List bucket artifacts with optional filters (bucket, ticket, producer, type).';
    category = 'Communication';

    inputSchema = {
        properties: {
            bucket: { type: 'string' },
            ticket_id: { type: 'string' },
            produced_by: { type: 'string' },
            type: { type: 'string' },
            limit: { type: 'number', description: 'Maximum number of artifacts to return.' }
        }
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const artifacts = await artifactStoreService.listArtifacts({
                bucket: args.bucket,
                ticket_id: args.ticket_id,
                produced_by: args.produced_by,
                type: args.type,
                limit: args.limit
            });

            return {
                content: [{ type: 'text', text: JSON.stringify(artifacts, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to list artifacts: ${error.message}` }],
                isError: true
            };
        }
    }
}
