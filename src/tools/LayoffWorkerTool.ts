import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { workerService } from '../services/WorkerService';

interface WorkerProfileManager {
    deleteProfile: (id: string) => boolean;
}

export class LayoffWorkerTool extends BaseTool {
    name = 'layoff_worker';
    description = 'Fire a worker and revoke the associated MCP profile token.';
    category = 'Communication';

    inputSchema = {
        properties: {
            worker_id: { type: 'string' }
        },
        required: ['worker_id']
    };

    constructor(private profileManager: WorkerProfileManager) {
        super();
    }

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const fired = await workerService.fireWorker(args.worker_id);
            const revoked = this.profileManager.deleteProfile(fired.profile_id);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({ fired_worker: fired, profile_revoked: revoked }, null, 2)
                }]
            };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to layoff worker: ${error.message}` }], isError: true };
        }
    }
}
