import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';

export interface Worker {
    worker_id: string;
    profile_id: string;
    name: string;
    role: string;
    system_prompt: string;
    allowed_tools: string[];
    wake_interval_minutes: number;
    next_wake_at: string;
    last_wake_at?: string;
    status: 'active' | 'fired';
    hired_at: string;
    fired_at?: string;
}

const NON_LAYOFFABLE_ROLES = new Set(['Legal Advisor', 'Security Advisor', 'Accountant', 'Buchhalter']);

export class WorkerService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'workers.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS workers (
                worker_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                allowed_tools TEXT NOT NULL,
                wake_interval_minutes INTEGER NOT NULL,
                next_wake_at TEXT NOT NULL,
                last_wake_at TEXT,
                status TEXT NOT NULL,
                hired_at TEXT NOT NULL,
                fired_at TEXT
            )
        `);
    }

    private fromRow(row: any): Worker {
        return {
            worker_id: row.worker_id,
            profile_id: row.profile_id,
            name: row.name,
            role: row.role,
            system_prompt: row.system_prompt,
            allowed_tools: JSON.parse(row.allowed_tools || '[]'),
            wake_interval_minutes: row.wake_interval_minutes,
            next_wake_at: row.next_wake_at,
            last_wake_at: row.last_wake_at || undefined,
            status: row.status,
            hired_at: row.hired_at,
            fired_at: row.fired_at || undefined
        };
    }

    public async hireWorker(input: {
        profile_id: string;
        name: string;
        role: string;
        system_prompt: string;
        allowed_tools: string[];
        wake_interval_minutes?: number;
    }): Promise<Worker> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');

        const worker_id = crypto.randomUUID();
        const now = new Date();
        const wakeMin = input.wake_interval_minutes || 30;
        const nextWake = new Date(now.getTime() + wakeMin * 60_000).toISOString();

        await this.db.run(
            `INSERT INTO workers (
                worker_id, profile_id, name, role, system_prompt, allowed_tools,
                wake_interval_minutes, next_wake_at, last_wake_at, status, hired_at, fired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            worker_id,
            input.profile_id,
            input.name,
            input.role,
            input.system_prompt,
            JSON.stringify(input.allowed_tools || []),
            wakeMin,
            nextWake,
            null,
            'active',
            now.toISOString(),
            null
        );

        return (await this.getWorker(worker_id))!;
    }

    public async getWorker(workerId: string): Promise<Worker | null> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');
        const row = await this.db.get('SELECT * FROM workers WHERE worker_id = ?', workerId);
        return row ? this.fromRow(row) : null;
    }

    public async listWorkers(status?: 'active' | 'fired'): Promise<Worker[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');

        let query = 'SELECT * FROM workers';
        const params: any[] = [];
        if (status) {
            query += ' WHERE status = ?';
            params.push(status);
        }
        query += ' ORDER BY hired_at DESC';

        const rows = await this.db.all(query, params);
        return rows.map((r: any) => this.fromRow(r));
    }

    public async fireWorker(workerId: string): Promise<Worker> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');

        const worker = await this.getWorker(workerId);
        if (!worker) throw new Error('Worker not found');
        if (NON_LAYOFFABLE_ROLES.has(worker.role)) {
            throw new Error(`Role ${worker.role} is protected and cannot be laid off.`);
        }

        const now = new Date().toISOString();
        await this.db.run(
            'UPDATE workers SET status = ?, fired_at = ? WHERE worker_id = ?',
            'fired',
            now,
            workerId
        );

        return (await this.getWorker(workerId))!;
    }

    public async getDueWorkers(nowDate: Date = new Date()): Promise<Worker[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');

        const rows = await this.db.all(
            'SELECT * FROM workers WHERE status = ? AND next_wake_at <= ? ORDER BY next_wake_at ASC',
            'active',
            nowDate.toISOString()
        );
        return rows.map((r: any) => this.fromRow(r));
    }

    public async markWorkerWoke(workerId: string, nowDate: Date = new Date()): Promise<void> {
        await this.initPromise;
        if (!this.db) throw new Error('Worker DB not initialized');

        const worker = await this.getWorker(workerId);
        if (!worker) return;

        const nowIso = nowDate.toISOString();
        const nextWake = new Date(nowDate.getTime() + worker.wake_interval_minutes * 60_000).toISOString();

        await this.db.run(
            'UPDATE workers SET last_wake_at = ?, next_wake_at = ? WHERE worker_id = ?',
            nowIso,
            nextWake,
            workerId
        );
    }
}

export const workerService = new WorkerService();
