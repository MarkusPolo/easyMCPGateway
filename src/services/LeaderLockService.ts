import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

export class LeaderLockService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'locks.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS leader_locks (
                lock_name TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                lease_until TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);
    }

    public async acquire(lockName: string, ownerId: string, leaseMs: number = 30000): Promise<boolean> {
        await this.initPromise;
        if (!this.db) return false;

        const now = new Date();
        const nowIso = now.toISOString();
        const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();

        const existing = await this.db.get('SELECT * FROM leader_locks WHERE lock_name = ?', lockName);
        if (!existing) {
            await this.db.run(
                'INSERT INTO leader_locks (lock_name, owner_id, lease_until, updated_at) VALUES (?, ?, ?, ?)',
                lockName,
                ownerId,
                leaseUntil,
                nowIso
            );
            return true;
        }

        if (new Date(existing.lease_until) < now || existing.owner_id === ownerId) {
            await this.db.run(
                'UPDATE leader_locks SET owner_id = ?, lease_until = ?, updated_at = ? WHERE lock_name = ?',
                ownerId,
                leaseUntil,
                nowIso,
                lockName
            );
            return true;
        }

        return false;
    }
}

export const leaderLockService = new LeaderLockService();
