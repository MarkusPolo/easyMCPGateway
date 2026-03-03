import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { Worker } from './WorkerService';

export interface WorkerRun {
    run_id: string;
    worker_id: string;
    ticket_id?: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out';
    started_at: string;
    finished_at?: string;
    exit_code?: number;
    error?: string;
    log: string;
}

export class WorkerRunService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'worker-runs.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS worker_runs (
                run_id TEXT PRIMARY KEY,
                worker_id TEXT NOT NULL,
                ticket_id TEXT,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                exit_code INTEGER,
                error TEXT,
                log TEXT NOT NULL
            )
        `);
    }

    public async runWorkerProcess(worker: Worker, ticketId?: string, timeoutMs: number = 120000): Promise<WorkerRun> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker run DB not initialized');

        const run: WorkerRun = {
            run_id: crypto.randomUUID(),
            worker_id: worker.worker_id,
            ticket_id: ticketId,
            status: 'running',
            started_at: new Date().toISOString(),
            log: ''
        };

        await this.db.run(
            `INSERT INTO worker_runs (run_id, worker_id, ticket_id, status, started_at, finished_at, exit_code, error, log)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            run.run_id, run.worker_id, run.ticket_id || null, run.status, run.started_at, null, null, null, ''
        );

        const result = await new Promise<WorkerRun>((resolve) => {
            const child = spawn('bash', ['-lc', `echo "Worker ${worker.name} run ${run.run_id}" && sleep 1 && echo "done"`], {
                cwd: process.cwd()
            });

            let output = '';
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGKILL');
            }, timeoutMs);

            child.stdout.on('data', (d) => { output += d.toString(); });
            child.stderr.on('data', (d) => { output += d.toString(); });

            child.on('close', async (code) => {
                clearTimeout(timer);
                const finishedAt = new Date().toISOString();
                const status: WorkerRun['status'] = timedOut ? 'timed_out' : (code === 0 ? 'succeeded' : 'failed');
                const finalRun: WorkerRun = {
                    ...run,
                    status,
                    finished_at: finishedAt,
                    exit_code: code === null ? undefined : code,
                    error: timedOut ? `Timed out after ${timeoutMs}ms` : (code === 0 ? undefined : `Exit code ${code}`),
                    log: output
                };

                await this.db!.run(
                    'UPDATE worker_runs SET status = ?, finished_at = ?, exit_code = ?, error = ?, log = ? WHERE run_id = ?',
                    finalRun.status,
                    finalRun.finished_at,
                    finalRun.exit_code || null,
                    finalRun.error || null,
                    finalRun.log,
                    finalRun.run_id
                );

                resolve(finalRun);
            });
        });

        return result;
    }

    public async listRuns(limit: number = 100): Promise<WorkerRun[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker run DB not initialized');

        const rows = await this.db.all('SELECT * FROM worker_runs ORDER BY started_at DESC LIMIT ?', limit);
        return rows.map((r: any) => ({
            run_id: r.run_id,
            worker_id: r.worker_id,
            ticket_id: r.ticket_id || undefined,
            status: r.status,
            started_at: r.started_at,
            finished_at: r.finished_at || undefined,
            exit_code: r.exit_code || undefined,
            error: r.error || undefined,
            log: r.log || ''
        }));
    }
}

export const workerRunService = new WorkerRunService();
