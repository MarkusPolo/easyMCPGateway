import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { schedulerService } from '../services/SchedulerService';

export class SchedulerTickTool extends BaseTool {
    name = 'scheduler_tick';
    description = 'Run one scheduler maintenance cycle (reclaim expired leases, retry due tickets).';
    category = 'Communication';

    inputSchema = {
        properties: {}
    };

    async execute(): Promise<ToolResponse> {
        try {
            const result = await schedulerService.runMaintenanceTick();
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Scheduler tick failed: ${error.message}` }],
                isError: true
            };
        }
    }
}
