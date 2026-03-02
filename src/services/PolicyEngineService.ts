import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';

export interface PolicyDecision {
    decision_id: string;
    profile_id: string;
    capability: string;
    idempotency_key: string;
    resource: string;
    allowed: boolean;
    reason: string;
    created_at: string;
}

export class PolicyEngineService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'policy.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS policy_decisions (
                decision_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                capability TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(profile_id, capability, idempotency_key)
            )
        `);
    }

    public async evaluate(input: { profile_id: string; capability: string; idempotency_key: string; resource: string; }): Promise<PolicyDecision> {
        await this.initPromise;
        if (!this.db) throw new Error('Policy DB not initialized');

        const existing = await this.db.get(
            'SELECT * FROM policy_decisions WHERE profile_id = ? AND capability = ? AND idempotency_key = ?',
            input.profile_id,
            input.capability,
            input.idempotency_key
        );
        if (existing) {
            return {
                decision_id: existing.decision_id,
                profile_id: existing.profile_id,
                capability: existing.capability,
                idempotency_key: existing.idempotency_key,
                resource: existing.resource,
                allowed: !!existing.allowed,
                reason: existing.reason,
                created_at: existing.created_at
            };
        }

        const allowed = this.simpleAllow(input.capability, input.resource);
        const decision: PolicyDecision = {
            decision_id: crypto.randomUUID(),
            profile_id: input.profile_id,
            capability: input.capability,
            idempotency_key: input.idempotency_key,
            resource: input.resource,
            allowed,
            reason: allowed ? 'Allowed by baseline policy.' : 'Denied by baseline policy.',
            created_at: new Date().toISOString()
        };

        await this.db.run(
            `INSERT INTO policy_decisions (decision_id, profile_id, capability, idempotency_key, resource, allowed, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            decision.decision_id,
            decision.profile_id,
            decision.capability,
            decision.idempotency_key,
            decision.resource,
            decision.allowed ? 1 : 0,
            decision.reason,
            decision.created_at
        );

        return decision;
    }

    private simpleAllow(capability: string, resource: string): boolean {
        if (capability === 'send_mail') {
            return resource.toLowerCase().endsWith('.eu') || resource.toLowerCase().endsWith('.de');
        }
        return true;
    }
}

export const policyEngineService = new PolicyEngineService();
