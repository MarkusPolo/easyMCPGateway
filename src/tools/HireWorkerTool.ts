import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { workerService } from '../services/WorkerService';

interface WorkerProfileCreator {
    createProfileWithTools: (name: string, allowedTools: string[]) => { id: string; token: string };
}

export class HireWorkerTool extends BaseTool {
    name = 'hire_worker';
    description = 'Hire a new worker with least-privilege tools and an auto-generated system prompt from principles + job posting.';
    category = 'Communication';

    inputSchema = {
        properties: {
            worker_name: { type: 'string' },
            role: { type: 'string' },
            job_posting: { type: 'string', description: 'Raw job posting text.' },
            job_posting_path: { type: 'string', description: 'Optional path to a markdown file with job posting.' },
            principles_path: { type: 'string', description: 'Defaults to ./principles.md' },
            allowed_tools: { type: 'array', items: { type: 'string' } },
            wake_interval_minutes: { type: 'number' }
        },
        required: ['worker_name', 'role', 'allowed_tools']
    };

    constructor(private profileCreator: WorkerProfileCreator) {
        super();
    }

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const principlesPath = path.resolve(process.cwd(), args.principles_path || 'principles.md');
            const principles = fs.existsSync(principlesPath)
                ? fs.readFileSync(principlesPath, 'utf-8')
                : 'No principles.md found. Define company principles to improve worker behavior.';

            let posting = args.job_posting || '';
            if (!posting && args.job_posting_path) {
                const jpPath = path.resolve(process.cwd(), args.job_posting_path);
                posting = fs.readFileSync(jpPath, 'utf-8');
            }
            if (!posting) {
                return { content: [{ type: 'text', text: 'Missing job_posting or job_posting_path.' }], isError: true };
            }

            const allowedTools: string[] = Array.isArray(args.allowed_tools) ? args.allowed_tools : [];
            const profile = this.profileCreator.createProfileWithTools(args.worker_name, allowedTools);

            const systemPrompt = [
                '# Company Principles',
                principles,
                '',
                '# Job Posting',
                posting,
                '',
                '# Runtime Protocol',
                '- Communicate via tickets and artifacts only.',
                '- Ticket statuses: new, ready, claimed, in_progress, waiting_review, blocked, done, canceled.',
                '- Claim tickets before execution and attach artifact ids on output.'
            ].join('\n');

            const worker = await workerService.hireWorker({
                profile_id: profile.id,
                name: args.worker_name,
                role: args.role,
                system_prompt: systemPrompt,
                allowed_tools: allowedTools,
                wake_interval_minutes: args.wake_interval_minutes || 30
            });

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        worker,
                        profile_id: profile.id,
                        bearer_token: profile.token
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to hire worker: ${error.message}` }], isError: true };
        }
    }
}
