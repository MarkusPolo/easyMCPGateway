import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scheduleService } from '../services/ScheduleService';

export class ScheduleDeleteTool extends BaseTool {
    name = 'schedule_delete';
    description = 'Delete a schedule definition.';
    category = 'Communication';

    inputSchema = {
        properties: {
            schedule_id: { type: 'string' }
        },
        required: ['schedule_id']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const deleted = await scheduleService.deleteSchedule(args.schedule_id);
            return { content: [{ type: 'text', text: deleted ? 'Schedule deleted.' : 'Schedule not found.' }], isError: !deleted };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to delete schedule: ${error.message}` }], isError: true };
        }
    }
}
