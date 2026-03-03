import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface Artifact {
    id: string;
    bucket: string;
    ticket_id?: string;
    produced_by: string;
    type: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
    metadata: Record<string, any>;
    created_at: string;
    storage_path: string;
}

export class ArtifactStoreService {
    private dbPath: string;
    private rootPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'artifacts.db');
        this.rootPath = path.resolve(process.cwd(), 'artifacts');
        this.initPromise = this.init();
    }

    private async init() {
        if (!fs.existsSync(this.rootPath)) fs.mkdirSync(this.rootPath, { recursive: true });
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS artifact_objects (
                id TEXT PRIMARY KEY,
                bucket TEXT NOT NULL,
                ticket_id TEXT,
                produced_by TEXT NOT NULL,
                type TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                metadata TEXT NOT NULL,
                created_at TEXT NOT NULL,
                storage_path TEXT NOT NULL
            )
        `);
    }

    private ensureSafeBucket(bucket: string): string {
        if (!/^[a-zA-Z0-9._-]+$/.test(bucket)) {
            throw new Error('Invalid bucket name. Use only letters, numbers, dot, underscore, dash.');
        }
        return bucket;
    }

    public async putArtifact(data: {
        bucket?: string;
        ticket_id?: string;
        produced_by: string;
        type: string;
        mime_type?: string;
        content_text?: string;
        content_base64?: string;
        filename?: string;
        metadata?: Record<string, any>;
    }): Promise<Artifact> {
        await this.initPromise;
        if (!this.db) throw new Error('Artifact DB not initialized');

        if (!data.content_text && !data.content_base64) {
            throw new Error('Either content_text or content_base64 is required.');
        }

        const id = crypto.randomUUID();
        const bucket = this.ensureSafeBucket(data.bucket || 'default');
        const created_at = new Date().toISOString();

        const raw = data.content_base64
            ? Buffer.from(data.content_base64, 'base64')
            : Buffer.from(data.content_text || '', 'utf-8');

        const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
        const size_bytes = raw.byteLength;
        const ext = data.filename ? path.extname(data.filename) : '';

        const dir = path.join(this.rootPath, bucket, id);
        fs.mkdirSync(dir, { recursive: true });
        const fileName = data.filename || `payload${ext || ''}`;
        const storage_path = path.join(dir, fileName);
        fs.writeFileSync(storage_path, raw);

        const artifact: Artifact = {
            id,
            bucket,
            ticket_id: data.ticket_id,
            produced_by: data.produced_by,
            type: data.type,
            mime_type: data.mime_type || 'application/octet-stream',
            size_bytes,
            sha256,
            metadata: data.metadata || {},
            created_at,
            storage_path
        };

        await this.db.run(
            `INSERT INTO artifact_objects (
                id, bucket, ticket_id, produced_by, type, mime_type, size_bytes, sha256, metadata, created_at, storage_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            artifact.id,
            artifact.bucket,
            artifact.ticket_id || null,
            artifact.produced_by,
            artifact.type,
            artifact.mime_type,
            artifact.size_bytes,
            artifact.sha256,
            JSON.stringify(artifact.metadata),
            artifact.created_at,
            artifact.storage_path
        );

        return artifact;
    }

    public async getArtifact(id: string): Promise<Artifact | null> {
        await this.initPromise;
        if (!this.db) throw new Error('Artifact DB not initialized');

        const row = await this.db.get('SELECT * FROM artifact_objects WHERE id = ?', id);
        if (!row) return null;

        return {
            id: row.id,
            bucket: row.bucket,
            ticket_id: row.ticket_id || undefined,
            produced_by: row.produced_by,
            type: row.type,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            sha256: row.sha256,
            metadata: JSON.parse(row.metadata || '{}'),
            created_at: row.created_at,
            storage_path: row.storage_path
        };
    }

    public async getArtifactContent(id: string, asBase64: boolean = true): Promise<string> {
        const artifact = await this.getArtifact(id);
        if (!artifact) throw new Error('Artifact not found');
        const raw = fs.readFileSync(artifact.storage_path);
        return asBase64 ? raw.toString('base64') : raw.toString('utf-8');
    }

    public async listArtifacts(filters?: { bucket?: string; ticket_id?: string; produced_by?: string; type?: string; limit?: number }): Promise<Artifact[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Artifact DB not initialized');

        let query = 'SELECT * FROM artifact_objects WHERE 1=1';
        const params: any[] = [];

        if (filters?.bucket) { query += ' AND bucket = ?'; params.push(filters.bucket); }
        if (filters?.ticket_id) { query += ' AND ticket_id = ?'; params.push(filters.ticket_id); }
        if (filters?.produced_by) { query += ' AND produced_by = ?'; params.push(filters.produced_by); }
        if (filters?.type) { query += ' AND type = ?'; params.push(filters.type); }

        query += ' ORDER BY created_at DESC';
        if (filters?.limit) { query += ' LIMIT ?'; params.push(filters.limit); }

        const rows = await this.db.all(query, params);
        return rows.map((row: any) => ({
            id: row.id,
            bucket: row.bucket,
            ticket_id: row.ticket_id || undefined,
            produced_by: row.produced_by,
            type: row.type,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            sha256: row.sha256,
            metadata: JSON.parse(row.metadata || '{}'),
            created_at: row.created_at,
            storage_path: row.storage_path
        }));
    }
}

export const artifactStoreService = new ArtifactStoreService();
