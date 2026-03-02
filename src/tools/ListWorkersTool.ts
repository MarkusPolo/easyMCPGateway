import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { workerService } from '../services/WorkerService';

export class ListWorkersTool extends BaseTool {
    name = 'worker_list';
    description = 'List hired workers and their runtime/auth profile linkage.';
    category = 'Communication';

    inputSchema = {
        properties: {
            status: { type: 'string', enum: ['active', 'fired'] }
        }
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const workers = await workerService.listWorkers(args.status);
            return { content: [{ type: 'text', text: JSON.stringify(workers, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to list workers: ${error.message}` }], isError: true };
        }
    }
}
