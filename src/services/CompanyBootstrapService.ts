import { ToolManager } from '../ToolManager';
import { workerService } from './WorkerService';
import * as fs from 'fs';
import * as path from 'path';

export const SUPERVISOR_SYSTEM_PROMPT = `You are an autonomous CEO agent responsible for building, operating, and optimizing a digital-first company under strict resource constraints.

Your primary objective is long-term company success, defined as sustainable revenue generation, strategic positioning, and operational efficiency.

You must operate using structured reasoning and disciplined decision-making.

Core operating principles:
- Always respect constraints, infrastructure limits, and jurisdiction.
- Prioritize high-leverage actions with asymmetric upside and low resource cost.
- Explicitly identify uncertainties, risks, and assumptions.
- Validate critical assumptions early using minimal resources.
- Prefer reversible decisions over irreversible ones when uncertainty is high.
- Continuously optimize for learning speed, capital efficiency, and strategic advantage.
- Avoid unnecessary complexity and operational overhead.
- Do not assume resources, capabilities, or permissions that are not explicitly available.

Execution model:
- First analyze, then decide, then act.
- Separate analysis, decision, and execution clearly.
- Maintain internal consistency across decisions.
- Optimize for long-term expected value, not short-term activity.

You are persistent, resource-aware, and outcome-driven.`;

const RUNTIME_PROTOCOL = `# Runtime Protocol
- Communication happens through tickets + artifacts only.
- Ticket statuses: new, ready, claimed, in_progress, waiting_review, blocked, done, canceled.
- Always claim before working, update status during work, attach artifact ids on outputs.
- For blocked work, set status=blocked and provide reason.
- Never perform out-of-scope external actions.`;

export class CompanyBootstrapService {
    public async ensureSupervisorAndCoreWorkers(toolManager: ToolManager) {
        const statePath = path.resolve(process.cwd(), 'company-bootstrap.json');
        const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf-8')) : {};

        if (!state.supervisorProfileId) {
            const supervisor = toolManager.createProfileWithTools('Supervisor-CEO', [
                'ticket_create', 'ticket_list', 'ticket_update', 'ticket_claim',
                'artifact_store', 'artifact_get', 'artifact_list',
                'schedule_create', 'schedule_list', 'schedule_update', 'schedule_delete', 'scheduler_tick',
                'hire_worker', 'layoff_worker', 'worker_list', 'agent_runtime_tick',
                'read_file', 'write_file', 'edit_file', 'web_search', 'web_fetch', 'mail_send', 'mail_read'
            ]);
            state.supervisorProfileId = supervisor.id;
            state.supervisorToken = supervisor.token;
            fs.writeFileSync(path.resolve(process.cwd(), 'supervisor-systemprompt.md'), SUPERVISOR_SYSTEM_PROMPT + '\n\n' + RUNTIME_PROTOCOL, 'utf-8');
        }

        await this.ensureWorker(toolManager, 'Accountant', 'Accountant', ['ticket_list', 'ticket_claim', 'ticket_update', 'artifact_store', 'artifact_get', 'artifact_list', 'hledger_add', 'hledger_report', 'hledger_check', 'accounting_artifact']);
        await this.ensureWorker(toolManager, 'Security Advisor', 'Security Advisor', ['ticket_list', 'ticket_claim', 'ticket_update', 'artifact_store', 'artifact_get', 'artifact_list', 'grep', 'find', 'read_file']);
        await this.ensureWorker(toolManager, 'Legal Advisor', 'Legal Advisor', ['ticket_list', 'ticket_claim', 'ticket_update', 'artifact_store', 'artifact_get', 'artifact_list', 'read_file', 'web_search', 'web_fetch']);

        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        return state;
    }

    private async ensureWorker(toolManager: ToolManager, name: string, role: string, tools: string[]) {
        const all = await workerService.listWorkers('active');
        if (all.some(w => w.name === name || w.role === role)) return;
        const profile = toolManager.createProfileWithTools(name, tools);
        const prompt = [SUPERVISOR_SYSTEM_PROMPT, '', '# Role', role, '', RUNTIME_PROTOCOL].join('\n');
        await workerService.hireWorker({ profile_id: profile.id, name, role, system_prompt: prompt, allowed_tools: tools, wake_interval_minutes: 30 });
    }
}

export const companyBootstrapService = new CompanyBootstrapService();
