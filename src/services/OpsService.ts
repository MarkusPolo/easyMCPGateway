import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

export class OpsService {
    public async readiness() {
        const files = ['tickets.db', 'workers.db', 'schedules.db', 'artifacts.db'];
        const checks: Record<string, boolean> = {};
        for (const f of files) checks[f] = fs.existsSync(path.resolve(process.cwd(), f));
        return { ok: Object.values(checks).every(Boolean), checks };
    }

    public liveness() {
        return { ok: true, ts: new Date().toISOString() };
    }

    public async metrics() {
        const ticketsDb = await open({ filename: path.resolve(process.cwd(), 'tickets.db'), driver: sqlite3.Database });
        const workersDb = await open({ filename: path.resolve(process.cwd(), 'workers.db'), driver: sqlite3.Database });
        const runsDb = await open({ filename: path.resolve(process.cwd(), 'worker-runs.db'), driver: sqlite3.Database });

        const ticketStatus = await ticketsDb.all('SELECT status, COUNT(*) as count FROM tickets GROUP BY status');
        const activeWorkers = await workersDb.get('SELECT COUNT(*) as cnt FROM workers WHERE status = ?', 'active');
        const failedRuns = await runsDb.get("SELECT COUNT(*) as cnt FROM worker_runs WHERE status IN ('failed','timed_out')");

        await ticketsDb.close();
        await workersDb.close();
        await runsDb.close();

        return {
            ts: new Date().toISOString(),
            ticket_status_counts: ticketStatus,
            active_workers: activeWorkers?.cnt || 0,
            failed_or_timed_out_runs: failedRuns?.cnt || 0
        };
    }
}

export const opsService = new OpsService();
