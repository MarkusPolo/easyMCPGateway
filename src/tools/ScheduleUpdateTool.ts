import { BaseTool } from './BaseTool';
import { ToolResponse, TicketCategory } from './types';
import { scheduleService } from '../services/ScheduleService';

export class ScheduleUpdateTool extends BaseTool {
    name = 'schedule_update';
    description = 'Update an existing schedule definition.';
    category = 'Communication';

    inputSchema = {
        properties: {
            schedule_id: { type: 'string' },
            business_goal: { type: 'string' },
            target_role: { type: 'string' },
            prompt: { type: 'string' },
            time: { type: 'string' },
            interval_seconds: { type: 'number' },
            last_reviewed: { type: 'string' },
            enabled: { type: 'boolean' },
            template_ticket: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['marketing', 'finance', 'code', 'legal', 'sales', 'ops'] },
                    planningMode: { type: 'boolean' },
                    priority: { type: 'number' }
                }
            }
        },
        required: ['schedule_id']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const updated = await scheduleService.updateSchedule(args.schedule_id, {
                business_goal: args.business_goal,
                target_role: args.target_role,
                prompt: args.prompt,
                time: args.time,
                interval_seconds: args.interval_seconds,
                last_reviewed: args.last_reviewed,
                enabled: args.enabled,
                template_ticket: args.template_ticket
                    ? {
                        title: args.template_ticket.title,
                        description: args.template_ticket.description,
                        category: args.template_ticket.category as TicketCategory,
                        planningMode: !!args.template_ticket.planningMode,
                        priority: args.template_ticket.priority || 5
                    }
                    : undefined
            });

            return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to update schedule: ${error.message}` }], isError: true };
        }
    }
}
