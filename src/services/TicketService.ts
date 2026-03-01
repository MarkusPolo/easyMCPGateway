import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';
import { Ticket, TicketStatus, TicketCategory } from '../tools/types';

export class TicketService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'tickets.db');
        this.initPromise = this.init();
    }

    private async init() {
        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    category TEXT NOT NULL,
                    priority INTEGER NOT NULL,
                    target_role_hint TEXT,
                    planningMode BOOLEAN NOT NULL,
                    deadline TEXT,
                    requested_by TEXT NOT NULL,
                    claimed_by TEXT,
                    claimed_at TEXT,
                    lease_until TEXT,
                    heartbeat_at TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_retry_at TEXT,
                    run_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    acceptance_criteria TEXT NOT NULL,
                    dependencies TEXT NOT NULL,
                    artifact_links TEXT NOT NULL,
                    reason TEXT
                )
            `);
            console.log("TicketService initialized correctly.");
        } catch (error) {
            console.error("Failed to initialize TicketService database:", error);
        }
    }

    private serializeTicket(t: Ticket): any[] {
        return [
            t.id, t.title, t.description, t.status, t.category, t.priority,
            t.target_role_hint || null, t.planningMode ? 1 : 0, t.deadline || null,
            t.requested_by, t.claimed_by || null, t.claimed_at || null,
            t.lease_until || null, t.heartbeat_at || null, t.attempts,
            t.next_retry_at || null, t.run_id || null, t.created_at, t.updated_at,
            JSON.stringify(t.acceptance_criteria || []),
            JSON.stringify(t.dependencies || []),
            JSON.stringify(t.artifact_links || []),
            t.reason || null
        ];
    }

    private deserializeTicket(row: any): Ticket {
        return {
            id: row.id,
            title: row.title,
            description: row.description,
            status: row.status as TicketStatus,
            category: row.category as TicketCategory,
            priority: row.priority,
            target_role_hint: row.target_role_hint || undefined,
            planningMode: !!row.planningMode,
            deadline: row.deadline || undefined,
            requested_by: row.requested_by,
            claimed_by: row.claimed_by || undefined,
            claimed_at: row.claimed_at || undefined,
            lease_until: row.lease_until || undefined,
            heartbeat_at: row.heartbeat_at || undefined,
            attempts: row.attempts,
            next_retry_at: row.next_retry_at || undefined,
            run_id: row.run_id || undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
            acceptance_criteria: JSON.parse(row.acceptance_criteria || '[]'),
            dependencies: JSON.parse(row.dependencies || '[]'),
            artifact_links: JSON.parse(row.artifact_links || '[]'),
            reason: row.reason || undefined
        };
    }

    public async createTicket(data: Partial<Ticket> & { title: string, description: string, category: TicketCategory, requested_by: string }): Promise<Ticket> {
        await this.initPromise;
        if (!this.db) throw new Error("DB not initialized");

        const now = new Date().toISOString();
        const ticket: Ticket = {
            id: data.id || crypto.randomUUID(),
            title: data.title,
            description: data.description,
            status: data.status || 'ready', // Usually starts as ready
            category: data.category || 'ops',
            priority: data.priority || 5,
            target_role_hint: data.target_role_hint,
            planningMode: data.planningMode || false,
            deadline: data.deadline,
            requested_by: data.requested_by,
            claimed_by: undefined,
            claimed_at: undefined,
            lease_until: undefined,
            heartbeat_at: undefined,
            attempts: 0,
            next_retry_at: undefined,
            run_id: data.run_id,
            created_at: now,
            updated_at: now,
            acceptance_criteria: data.acceptance_criteria || [],
            dependencies: data.dependencies || [],
            artifact_links: data.artifact_links || []
        };

        const values = this.serializeTicket(ticket);
        await this.db.run(`
            INSERT INTO tickets (
                id, title, description, status, category, priority,
                target_role_hint, planningMode, deadline,
                requested_by, claimed_by, claimed_at,
                lease_until, heartbeat_at, attempts,
                next_retry_at, run_id, created_at, updated_at,
                acceptance_criteria, dependencies, artifact_links, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, values);

        return ticket;
    }

    public async getTicket(id: string): Promise<Ticket | null> {
        await this.initPromise;
        if (!this.db) throw new Error("DB not initialized");

        const row = await this.db.get('SELECT * FROM tickets WHERE id = ?', id);
        return row ? this.deserializeTicket(row) : null;
    }

    public async listTickets(filters?: { status?: string, category?: string, target_role_hint?: string }): Promise<Ticket[]> {
        await this.initPromise;
        if (!this.db) throw new Error("DB not initialized");

        let query = 'SELECT * FROM tickets WHERE 1=1';
        const params: any[] = [];

        if (filters?.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters?.category) {
            query += ' AND category = ?';
            params.push(filters.category);
        }
        if (filters?.target_role_hint) {
            query += ' AND target_role_hint = ?';
            params.push(filters.target_role_hint);
        }

        const rows = await this.db.all(query, params);
        return rows.map(r => this.deserializeTicket(r));
    }

    public async claimTicket(ticketId: string, profileName: string, maxAttempts: number = 3): Promise<Ticket | null> {
        await this.initPromise;
        if (!this.db) throw new Error("DB not initialized");

        const ticket = await this.getTicket(ticketId);
        if (!ticket) throw new Error("Ticket not found");

        const now = new Date();
        const nowIso = now.toISOString();

        // Steal rule: lease_until < now OR heartbeat_at < now - heartbeat_grace (2 mins)
        let canClaim = false;
        if (ticket.status === 'ready') {
            canClaim = true;
        } else if (ticket.status === 'in_progress' || ticket.status === 'claimed') {
            const leaseExpired = ticket.lease_until && new Date(ticket.lease_until) < now;
            const heartbeatGrace = new Date(now.getTime() - 2 * 60 * 1000);
            const heartbeatExpired = ticket.heartbeat_at && new Date(ticket.heartbeat_at) < heartbeatGrace;
            if (leaseExpired || heartbeatExpired) {
                canClaim = true;
            }
        }

        if (!canClaim) {
            throw new Error(`Ticket is currently claimed or not ready. Status: ${ticket.status}`);
        }

        if (ticket.attempts >= maxAttempts) {
            // Cancel ticket if max attempts reached
            await this.updateTicket(ticketId, 'canceled', { reason: 'Max attempts reached during claim' });
            throw new Error(`Ticket canceled due to exceeding max attempts (${maxAttempts})`);
        }

        const leaseDurationMs = 5 * 60 * 1000; // 5 minute lease
        const leaseUntil = new Date(now.getTime() + leaseDurationMs).toISOString();

        ticket.status = 'claimed';
        ticket.claimed_by = profileName;
        ticket.claimed_at = nowIso;
        ticket.lease_until = leaseUntil;
        ticket.heartbeat_at = nowIso;
        ticket.attempts += 1;
        ticket.updated_at = nowIso;

        await this.db.run(`
            UPDATE tickets
            SET status = ?, claimed_by = ?, claimed_at = ?, lease_until = ?, heartbeat_at = ?, attempts = ?, updated_at = ?
            WHERE id = ?
        `, [
            ticket.status, ticket.claimed_by, ticket.claimed_at, ticket.lease_until,
            ticket.heartbeat_at, ticket.attempts, ticket.updated_at, ticket.id
        ]);

        return ticket;
    }

    public async heartbeat(ticketId: string, profileName: string): Promise<boolean> {
        await this.initPromise;
        if (!this.db) return false;

        const ticket = await this.getTicket(ticketId);
        if (!ticket || ticket.claimed_by !== profileName) return false;

        const now = new Date();
        const leaseDurationMs = 5 * 60 * 1000;
        const leaseUntil = new Date(now.getTime() + leaseDurationMs).toISOString();

        await this.db.run(`
            UPDATE tickets SET heartbeat_at = ?, lease_until = ?, updated_at = ?
            WHERE id = ? AND claimed_by = ?
        `, [now.toISOString(), leaseUntil, now.toISOString(), ticketId, profileName]);

        return true;
    }

    public async updateTicket(ticketId: string, status: TicketStatus, updates: Partial<Ticket> = {}): Promise<Ticket> {
        await this.initPromise;
        if (!this.db) throw new Error("DB not initialized");

        const ticket = await this.getTicket(ticketId);
        if (!ticket) throw new Error("Ticket not found");

        const nowIso = new Date().toISOString();

        // Update fields safely
        const setClauses: string[] = ['status = ?', 'updated_at = ?'];
        const values: any[] = [status, nowIso];

        if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
        if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
        if (updates.priority !== undefined) { setClauses.push('priority = ?'); values.push(updates.priority); }
        if (updates.category !== undefined) { setClauses.push('category = ?'); values.push(updates.category); }
        if (updates.reason !== undefined) { setClauses.push('reason = ?'); values.push(updates.reason); }
        if (updates.acceptance_criteria !== undefined) { setClauses.push('acceptance_criteria = ?'); values.push(JSON.stringify(updates.acceptance_criteria)); }
        if (updates.artifact_links !== undefined) { setClauses.push('artifact_links = ?'); values.push(JSON.stringify(updates.artifact_links)); }

        values.push(ticketId);

        await this.db.run(`
            UPDATE tickets
            SET ${setClauses.join(', ')}
            WHERE id = ?
        `, values);

        return (await this.getTicket(ticketId))!;
    }
}

export const ticketService = new TicketService();
