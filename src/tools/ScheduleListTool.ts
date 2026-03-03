import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scheduleService } from '../services/ScheduleService';

export class ScheduleListTool extends BaseTool {
    name = 'schedule_list';
    description = 'List schedule definitions (optional filter by owner/role/enabled).';
    category = 'Communication';

    inputSchema = {
        properties: {
            owner_id: { type: 'string' },
            target_role: { type: 'string' },
            enabled: { type: 'boolean' }
        }
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const schedules = await scheduleService.listSchedules({
                owner_id: args.owner_id,
                target_role: args.target_role,
                enabled: args.enabled
            });
            return { content: [{ type: 'text', text: JSON.stringify(schedules, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to list schedules: ${error.message}` }], isError: true };
        }
    }
}
