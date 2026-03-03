import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { supervisorContextService } from '../services/SupervisorContextService';

export class SupervisorContextTool extends BaseTool {
    name = 'supervisor_context';
    description = 'Build latest supervisor context package from core files, tickets, artifacts, workforce and rules.';
    category = 'Communication';

    inputSchema = { properties: {} };

    async execute(): Promise<ToolResponse> {
        try {
            const ctx = await supervisorContextService.buildLatestContext();
            return { content: [{ type: 'text', text: ctx }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to build supervisor context: ${error.message}` }], isError: true };
        }
    }
}
