import * as fs from 'fs';
import * as path from 'path';
import { ticketService } from './TicketService';
import { artifactStoreService } from './ArtifactStoreService';
import { workerService } from './WorkerService';
import { SUPERVISOR_SYSTEM_PROMPT } from './CompanyBootstrapService';

export class SupervisorContextService {
    public async buildLatestContext(): Promise<string> {
        const coreFiles = ['principles.md', 'goals.md', 'strategy.md', 'mission.md'];
        const coreSections: string[] = [];
        for (const file of coreFiles) {
            const abs = path.resolve(process.cwd(), file);
            const content = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '(missing)';
            coreSections.push(`## ${file}\n${content.substring(0, 4000)}`);
        }

        const tickets = await ticketService.listTickets();
        const latestTickets = tickets
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 20)
            .map(t => `- ${t.id} | ${t.status} | ${t.category} | ${t.title}`)
            .join('\n');

        const artifacts = await artifactStoreService.listArtifacts({ limit: 20 });
        const latestArtifacts = artifacts
            .map(a => `- ${a.id} | ${a.bucket} | ${a.type} | by ${a.produced_by} | ${a.created_at}`)
            .join('\n');

        const workers = await workerService.listWorkers();
        const workerSummary = workers.map(w => `- ${w.name} (${w.role}) status=${w.status} next_wake=${w.next_wake_at}`).join('\n');

        return [
            '# Supervisor Prompt Machine Output',
            '## System Prompt',
            SUPERVISOR_SYSTEM_PROMPT,
            '## Runtime Protocol',
            '- Communication only via tickets + artifacts.',
            '- Ticket statuses: new, ready, claimed, in_progress, waiting_review, blocked, done, canceled.',
            '- Attach artifact ids to ticket updates and keep transitions valid.',
            '',
            '## Latest Ticket Context',
            latestTickets || '(none)',
            '',
            '## Latest Artifact Context',
            latestArtifacts || '(none)',
            '',
            '## Workforce Context',
            workerSummary || '(none)',
            '',
            '## Core Files',
            ...coreSections
        ].join('\n');
    }
}

export const supervisorContextService = new SupervisorContextService();
