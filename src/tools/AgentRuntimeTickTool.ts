import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { agentRuntimeService } from '../services/AgentRuntimeService';

export class AgentRuntimeTickTool extends BaseTool {
    name = 'agent_runtime_tick';
    description = 'Run one worker runtime wake cycle (checks due workers, logs wakes, creates wake tickets).';
    category = 'Communication';

    inputSchema = { properties: {} };

    async execute(): Promise<ToolResponse> {
        try {
            const result = await agentRuntimeService.runWakeTick();
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Agent runtime tick failed: ${error.message}` }], isError: true };
        }
    }
}
