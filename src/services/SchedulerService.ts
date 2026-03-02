import { ticketService } from './TicketService';
import { scheduleService } from './ScheduleService';

export interface SchedulerTickResult {
    reclaimed: number;
    retried: number;
    schedulesTriggered: number;
    schedulesFailed: number;
    touchedTickets: string[];
    scheduleRunIds: string[];
}

export class SchedulerService {
    public async runMaintenanceTick(): Promise<SchedulerTickResult> {
        const now = new Date();
        const tickets = await ticketService.listTickets();

        let reclaimed = 0;
        let retried = 0;
        const touchedTickets: string[] = [];

        for (const ticket of tickets) {
            if (
                (ticket.status === 'claimed' || ticket.status === 'in_progress') &&
                ticket.lease_until &&
                new Date(ticket.lease_until) < now
            ) {
                await ticketService.updateTicket(ticket.id, 'ready', {
                    reason: 'Auto-reclaimed by scheduler because lease expired.'
                }, { actorId: 'scheduler', isPrivileged: true });
                reclaimed += 1;
                touchedTickets.push(ticket.id);
                continue;
            }

            if (
                ticket.status === 'blocked' &&
                ticket.next_retry_at &&
                new Date(ticket.next_retry_at) <= now
            ) {
                await ticketService.updateTicket(ticket.id, 'ready', {
                    reason: 'Retry window reached. Moved back to ready by scheduler.'
                }, { actorId: 'scheduler', isPrivileged: true });
                retried += 1;
                touchedTickets.push(ticket.id);
            }
        }

        const scheduleRuns = await scheduleService.runDueSchedules(now);

        return {
            reclaimed,
            retried,
            schedulesTriggered: scheduleRuns.triggered,
            schedulesFailed: scheduleRuns.failed,
            touchedTickets,
            scheduleRunIds: scheduleRuns.run_ids
        };
    }
}

export const schedulerService = new SchedulerService();
