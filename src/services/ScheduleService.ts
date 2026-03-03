import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';
import { ticketService } from './TicketService';
import { TicketCategory } from '../tools/types';

export interface ScheduleDefinition {
    schedule_id: string;
    owner_id: string;
    business_goal: string;
    target_role: string;
    prompt: string;
    template_ticket: {
        title: string;
        description: string;
        category: TicketCategory;
        planningMode: boolean;
        priority: number;
    };
    time?: string;
    interval_seconds?: number;
    next_run_at: string;
    last_reviewed?: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface ScheduleRun {
    run_id: string;
    schedule_id: string;
    created_ticket_id?: string;
    created_at: string;
    status: 'created' | 'failed' | 'skipped';
    error?: string;
}

export class ScheduleService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'schedules.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS schedule_definitions (
                schedule_id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                business_goal TEXT NOT NULL,
                target_role TEXT NOT NULL,
                prompt TEXT NOT NULL,
                template_ticket TEXT NOT NULL,
                time TEXT,
                interval_seconds INTEGER,
                next_run_at TEXT NOT NULL,
                last_reviewed TEXT,
                enabled INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schedule_runs (
                run_id TEXT PRIMARY KEY,
                schedule_id TEXT NOT NULL,
                created_ticket_id TEXT,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT
            );
        `);
    }

    private toDefinition(row: any): ScheduleDefinition {
        return {
            schedule_id: row.schedule_id,
            owner_id: row.owner_id,
            business_goal: row.business_goal,
            target_role: row.target_role,
            prompt: row.prompt,
            template_ticket: JSON.parse(row.template_ticket),
            time: row.time || undefined,
            interval_seconds: row.interval_seconds || undefined,
            next_run_at: row.next_run_at,
            last_reviewed: row.last_reviewed || undefined,
            enabled: !!row.enabled,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    public async createSchedule(input: {
        owner_id: string;
        business_goal: string;
        target_role: string;
        prompt: string;
        template_ticket: ScheduleDefinition['template_ticket'];
        time?: string;
        interval_seconds?: number;
        enabled?: boolean;
    }): Promise<ScheduleDefinition> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');

        if (!input.time && !input.interval_seconds) {
            throw new Error('Either time or interval_seconds must be provided.');
        }

        const now = new Date().toISOString();
        const schedule_id = crypto.randomUUID();
        const next_run_at = input.time
            ? new Date(input.time).toISOString()
            : new Date(Date.now() + (input.interval_seconds || 0) * 1000).toISOString();

        await this.db.run(
            `INSERT INTO schedule_definitions (
                schedule_id, owner_id, business_goal, target_role, prompt, template_ticket,
                time, interval_seconds, next_run_at, last_reviewed, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            schedule_id,
            input.owner_id,
            input.business_goal,
            input.target_role,
            input.prompt,
            JSON.stringify(input.template_ticket),
            input.time || null,
            input.interval_seconds || null,
            next_run_at,
            now,
            input.enabled === false ? 0 : 1,
            now,
            now
        );

        const created = await this.getSchedule(schedule_id);
        if (!created) throw new Error('Failed to create schedule');
        return created;
    }

    public async getSchedule(scheduleId: string): Promise<ScheduleDefinition | null> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');
        const row = await this.db.get('SELECT * FROM schedule_definitions WHERE schedule_id = ?', scheduleId);
        return row ? this.toDefinition(row) : null;
    }

    public async listSchedules(filters?: { owner_id?: string; target_role?: string; enabled?: boolean }): Promise<ScheduleDefinition[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');

        let query = 'SELECT * FROM schedule_definitions WHERE 1=1';
        const params: any[] = [];
        if (filters?.owner_id) { query += ' AND owner_id = ?'; params.push(filters.owner_id); }
        if (filters?.target_role) { query += ' AND target_role = ?'; params.push(filters.target_role); }
        if (typeof filters?.enabled === 'boolean') { query += ' AND enabled = ?'; params.push(filters.enabled ? 1 : 0); }
        query += ' ORDER BY next_run_at ASC';

        const rows = await this.db.all(query, params);
        return rows.map((r: any) => this.toDefinition(r));
    }

    public async updateSchedule(scheduleId: string, updates: Partial<Pick<ScheduleDefinition, 'business_goal' | 'target_role' | 'prompt' | 'time' | 'interval_seconds' | 'last_reviewed' | 'enabled'>> & { template_ticket?: ScheduleDefinition['template_ticket'] }): Promise<ScheduleDefinition> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');
        const current = await this.getSchedule(scheduleId);
        if (!current) throw new Error('Schedule not found');

        const set: string[] = ['updated_at = ?'];
        const vals: any[] = [new Date().toISOString()];

        if (updates.business_goal !== undefined) { set.push('business_goal = ?'); vals.push(updates.business_goal); }
        if (updates.target_role !== undefined) { set.push('target_role = ?'); vals.push(updates.target_role); }
        if (updates.prompt !== undefined) { set.push('prompt = ?'); vals.push(updates.prompt); }
        if (updates.time !== undefined) { set.push('time = ?'); vals.push(updates.time); set.push('next_run_at = ?'); vals.push(new Date(updates.time).toISOString()); }
        if (updates.interval_seconds !== undefined) { set.push('interval_seconds = ?'); vals.push(updates.interval_seconds); }
        if (updates.last_reviewed !== undefined) { set.push('last_reviewed = ?'); vals.push(updates.last_reviewed); }
        if (updates.template_ticket !== undefined) { set.push('template_ticket = ?'); vals.push(JSON.stringify(updates.template_ticket)); }
        if (updates.enabled !== undefined) { set.push('enabled = ?'); vals.push(updates.enabled ? 1 : 0); }

        vals.push(scheduleId);
        await this.db.run(`UPDATE schedule_definitions SET ${set.join(', ')} WHERE schedule_id = ?`, vals);

        return (await this.getSchedule(scheduleId))!;
    }

    public async deleteSchedule(scheduleId: string): Promise<boolean> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');
        const res = await this.db.run('DELETE FROM schedule_definitions WHERE schedule_id = ?', scheduleId);
        return (res.changes || 0) > 0;
    }

    public async runDueSchedules(nowInput: Date = new Date()): Promise<{ triggered: number; failed: number; run_ids: string[] }> {
        await this.initPromise;
        if (!this.db) throw new Error('Schedule DB not initialized');

        const now = nowInput.toISOString();
        const due = await this.db.all(
            'SELECT * FROM schedule_definitions WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC',
            now
        );

        let triggered = 0;
        let failed = 0;
        const run_ids: string[] = [];

        for (const row of due) {
            const schedule = this.toDefinition(row);
            const run_id = crypto.randomUUID();
            run_ids.push(run_id);

            try {
                const description = `${schedule.template_ticket.description}\n\n[Schedule Prompt]\n${schedule.prompt}`;
                const ticket = await ticketService.createTicket({
                    title: schedule.template_ticket.title,
                    description,
                    category: schedule.template_ticket.category,
                    planningMode: schedule.template_ticket.planningMode,
                    priority: schedule.template_ticket.priority,
                    target_role_hint: schedule.target_role,
                    requested_by: schedule.owner_id
                });

                await this.db.run(
                    'INSERT INTO schedule_runs (run_id, schedule_id, created_ticket_id, created_at, status, error) VALUES (?, ?, ?, ?, ?, ?)',
                    run_id,
                    schedule.schedule_id,
                    ticket.id,
                    now,
                    'created',
                    null
                );

                const nextRun = schedule.interval_seconds
                    ? new Date(nowInput.getTime() + schedule.interval_seconds * 1000).toISOString()
                    : schedule.time
                        ? new Date(schedule.time).toISOString()
                        : schedule.next_run_at;

                const disableAfterOneShot = !schedule.interval_seconds;
                await this.db.run(
                    'UPDATE schedule_definitions SET next_run_at = ?, enabled = ?, updated_at = ? WHERE schedule_id = ?',
                    nextRun,
                    disableAfterOneShot ? 0 : 1,
                    now,
                    schedule.schedule_id
                );

                triggered += 1;
            } catch (error: any) {
                failed += 1;
                await this.db.run(
                    'INSERT INTO schedule_runs (run_id, schedule_id, created_ticket_id, created_at, status, error) VALUES (?, ?, ?, ?, ?, ?)',
                    run_id,
                    schedule.schedule_id,
                    null,
                    now,
                    'failed',
                    error.message
                );
            }
        }

        return { triggered, failed, run_ids };
    }
}

export const scheduleService = new ScheduleService();
