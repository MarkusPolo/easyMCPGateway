import { BaseTool } from './BaseTool';
import { ToolResponse, TicketCategory } from './types';
import { scheduleService } from '../services/ScheduleService';

export class ScheduleCreateTool extends BaseTool {
    name = 'schedule_create';
    description = 'Create a managed schedule definition that can generate tickets later.';
    category = 'Communication';

    inputSchema = {
        properties: {
            business_goal: { type: 'string' },
            target_role: { type: 'string' },
            prompt: { type: 'string' },
            time: { type: 'string', description: 'One-shot ISO datetime.' },
            interval_seconds: { type: 'number', description: 'Periodic cadence in seconds.' },
            template_ticket: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['marketing', 'finance', 'code', 'legal', 'sales', 'ops'] },
                    planningMode: { type: 'boolean' },
                    priority: { type: 'number' }
                },
                required: ['title', 'description', 'category']
            },
            enabled: { type: 'boolean' }
        },
        required: ['business_goal', 'target_role', 'prompt', 'template_ticket']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) {
            return { content: [{ type: 'text', text: 'profileId is required' }], isError: true };
        }
        try {
            const created = await scheduleService.createSchedule({
                owner_id: profileId,
                business_goal: args.business_goal,
                target_role: args.target_role,
                prompt: args.prompt,
                time: args.time,
                interval_seconds: args.interval_seconds,
                enabled: args.enabled,
                template_ticket: {
                    title: args.template_ticket.title,
                    description: args.template_ticket.description,
                    category: args.template_ticket.category as TicketCategory,
                    planningMode: !!args.template_ticket.planningMode,
                    priority: args.template_ticket.priority || 5
                }
            });

            return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to create schedule: ${error.message}` }], isError: true };
        }
    }
}
