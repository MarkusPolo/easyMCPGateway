import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

export interface AuditLogEntry {
    id?: number;
    timestamp?: string;
    tool_name: string;
    parameters: string;
    result: string;
    is_error: boolean;
    duration_ms: number;
    token_usage?: number;
    profile_name?: string;
}

export class AuditLogger {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'audit.db');
        this.initPromise = this.init();
    }

    private async init() {
        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS tool_executions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    tool_name TEXT NOT NULL,
                    parameters TEXT,
                    result TEXT,
                    is_error BOOLEAN NOT NULL,
                    duration_ms INTEGER NOT NULL
                )
            `);

            // Safe Migration: Add token_usage and profile_name if they don't exist
            try {
                await this.db.exec(`ALTER TABLE tool_executions ADD COLUMN token_usage INTEGER DEFAULT 0;`);
            } catch (migrationError: any) {
                // Ignore "duplicate column name" errors
            }
            try {
                await this.db.exec(`ALTER TABLE tool_executions ADD COLUMN profile_name TEXT DEFAULT 'Local Admin';`);
            } catch (migrationError: any) {
                // Ignore "duplicate column name" errors
            }

            console.log("Audit Logger initialized correctly.");
        } catch (error) {
            console.error("Failed to initialize Audit Logger database:", error);
        }
    }

    public async logExecution(entry: AuditLogEntry) {
        await this.initPromise;
        if (!this.db) {
            console.error("Database not initialized, skipping audit log.");
            return;
        }

        try {
            await this.db.run(`
                INSERT INTO tool_executions (tool_name, parameters, result, is_error, duration_ms, token_usage, profile_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                entry.tool_name,
                entry.parameters,
                entry.result,
                entry.is_error ? 1 : 0,
                entry.duration_ms,
                entry.token_usage || 0,
                entry.profile_name || 'Local Admin'
            ]);
        } catch (error) {
            console.error("Failed to insert audit log:", error);
        }
    }

    public async getRecentLogs(limit: number = 50, offset: number = 0) {
        await this.initPromise;
        if (!this.db) return [];
        return await this.db.all(`
            SELECT * FROM tool_executions
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }

    public async getAnalytics() {
        await this.initPromise;
        if (!this.db) return {};

        const totalRunsRow = await this.db.get(`SELECT COUNT(*) as count FROM tool_executions`);
        const totalErrorsRow = await this.db.get(`SELECT COUNT(*) as count FROM tool_executions WHERE is_error = 1`);
        const avgDurationRow = await this.db.get(`SELECT AVG(duration_ms) as avg FROM tool_executions`);
        const totalTokensRow = await this.db.get(`SELECT SUM(token_usage) as total FROM tool_executions`);

        const toolBreakdown = await this.db.all(`
            SELECT 
                tool_name, 
                COUNT(*) as count, 
                SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) as error_count,
                AVG(duration_ms) as avg_duration,
                SUM(token_usage) as total_tokens
            FROM tool_executions
            GROUP BY tool_name
            ORDER BY count DESC
        `);

        const totalRuns = totalRunsRow?.count || 0;
        const totalErrors = totalErrorsRow?.count || 0;
        const avgDuration = avgDurationRow?.avg || 0;
        const totalTokens = totalTokensRow?.total || 0;

        return {
            totalRuns,
            totalErrors,
            successRate: totalRuns > 0 ? ((totalRuns - totalErrors) / totalRuns) * 100 : 100,
            avgDurationMs: Math.round(avgDuration),
            totalTokens,
            toolBreakdown
        };
    }
}
