import { workerService } from './WorkerService';
import { ticketService } from './TicketService';
import { artifactStoreService } from './ArtifactStoreService';
import { workerRunService } from './WorkerRunService';

export interface AgentRuntimeTickResult {
    awakened: number;
    createdTickets: string[];
    wakeArtifacts: string[];
    runs: string[];
}

export class AgentRuntimeService {
    public async runWakeTick(nowDate: Date = new Date()): Promise<AgentRuntimeTickResult> {
        const dueWorkers = await workerService.getDueWorkers(nowDate);

        let awakened = 0;
        const createdTickets: string[] = [];
        const wakeArtifacts: string[] = [];
        const runs: string[] = [];

        for (const worker of dueWorkers) {
            const ready = await ticketService.listTickets({ status: 'ready', target_role_hint: worker.role });

            const artifact = await artifactStoreService.putArtifact({
                bucket: 'runtime-wake-logs',
                produced_by: worker.profile_id,
                type: 'runtime_wake_event',
                mime_type: 'application/json',
                content_text: JSON.stringify({
                    worker_id: worker.worker_id,
                    role: worker.role,
                    ts: nowDate.toISOString(),
                    ready_ticket_ids: ready.map(t => t.id)
                }, null, 2),
                filename: `wake-${nowDate.getTime()}.json`
            });
            wakeArtifacts.push(artifact.id);

            if (ready.length > 0) {
                const claim = await ticketService.claimTicket(ready[0].id, worker.profile_id).catch(() => null);
                const run = await workerRunService.runWorkerProcess(worker, claim?.id, 60_000);
                runs.push(run.run_id);

                const runtimeTicket = await ticketService.createTicket({
                    title: `Wake cycle for ${worker.name}`,
                    description: [
                        `Worker role: ${worker.role}`,
                        `System prompt:\n${worker.system_prompt}`,
                        `Ready tickets currently available for role '${worker.role}': ${ready.map(t => t.id).join(', ')}`,
                        `Runtime wake artifact: ${artifact.id}`
                    ].join('\n\n'),
                    category: 'ops',
                    planningMode: false,
                    priority: 5,
                    target_role_hint: worker.role,
                    requested_by: 'agent-runtime'
                });
                createdTickets.push(runtimeTicket.id);
            }

            await workerService.markWorkerWoke(worker.worker_id, nowDate);
            awakened += 1;
        }

        return { awakened, createdTickets, wakeArtifacts, runs };
    }
}

export const agentRuntimeService = new AgentRuntimeService();
