import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

export interface SystemState {
    is_running: boolean;
    started_at?: string;
    started_by?: string;
}

export class SystemControlService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'system-control.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS system_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);
        await this.ensureDefaults();
    }

    private async ensureDefaults() {
        if (!this.db) return;
        const row = await this.db.get('SELECT value FROM system_state WHERE key = ?', 'is_running');
        if (!row) {
            await this.db.run(
                'INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)',
                'is_running',
                'false',
                new Date().toISOString()
            );
        }
    }

    private async setValue(key: string, value: string) {
        await this.initPromise;
        if (!this.db) throw new Error('System control DB not initialized');
        await this.db.run(
            `INSERT INTO system_state (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
            key,
            value,
            new Date().toISOString()
        );
    }

    private async getValue(key: string): Promise<string | null> {
        await this.initPromise;
        if (!this.db) throw new Error('System control DB not initialized');
        const row = await this.db.get('SELECT value FROM system_state WHERE key = ?', key);
        return row?.value || null;
    }

    public async getState(): Promise<SystemState> {
        const isRunning = (await this.getValue('is_running')) === 'true';
        const startedAt = await this.getValue('started_at');
        const startedBy = await this.getValue('started_by');
        return {
            is_running: isRunning,
            started_at: startedAt || undefined,
            started_by: startedBy || undefined
        };
    }

    public async start(startedBy: string): Promise<SystemState> {
        await this.setValue('is_running', 'true');
        await this.setValue('started_at', new Date().toISOString());
        await this.setValue('started_by', startedBy);
        return this.getState();
    }
}

export const systemControlService = new SystemControlService();
