import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { artifactStoreService } from '../services/ArtifactStoreService';

export class ArtifactGetTool extends BaseTool {
    name = 'artifact_get';
    description = 'Read artifact metadata and optionally inline its content.';
    category = 'Communication';

    inputSchema = {
        properties: {
            artifact_id: { type: 'string', description: 'Artifact ID to load.' },
            include_content: { type: 'boolean', description: 'Include artifact payload in response.' },
            as_base64: { type: 'boolean', description: 'If include_content=true, return payload as base64.' }
        },
        required: ['artifact_id']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const artifact = await artifactStoreService.getArtifact(args.artifact_id);
            if (!artifact) {
                return { content: [{ type: 'text', text: 'Artifact not found.' }], isError: true };
            }

            const response: Record<string, any> = { artifact };
            if (args.include_content) {
                response.content = await artifactStoreService.getArtifactContent(
                    args.artifact_id,
                    args.as_base64 !== false
                );
                response.content_encoding = args.as_base64 === false ? 'utf-8' : 'base64';
            }

            return {
                content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to get artifact: ${error.message}` }],
                isError: true
            };
        }
    }
}
