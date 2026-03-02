import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TicketReview {
    review_id: string;
    ticket_id: string;
    reviewer_profile_id: string;
    reviewer_role: string;
    decision: 'approved' | 'changes_requested' | 'rejected';
    confidence: number;
    notes: string;
    created_at: string;
}

export class ReviewService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'reviews.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS ticket_reviews (
                review_id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL,
                reviewer_profile_id TEXT NOT NULL,
                reviewer_role TEXT NOT NULL,
                decision TEXT NOT NULL,
                confidence REAL NOT NULL,
                notes TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        `);
    }

    public async submitReview(input: Omit<TicketReview, 'review_id' | 'created_at'>): Promise<TicketReview> {
        await this.initPromise;
        if (!this.db) throw new Error('Review DB not initialized');

        const review: TicketReview = {
            review_id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            ...input
        };

        await this.db.run(
            `INSERT INTO ticket_reviews (review_id, ticket_id, reviewer_profile_id, reviewer_role, decision, confidence, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            review.review_id,
            review.ticket_id,
            review.reviewer_profile_id,
            review.reviewer_role,
            review.decision,
            review.confidence,
            review.notes,
            review.created_at
        );

        return review;
    }

    public async listReviews(ticketId?: string): Promise<TicketReview[]> {
        await this.initPromise;
        if (!this.db) throw new Error('Review DB not initialized');

        let query = 'SELECT * FROM ticket_reviews';
        const params: any[] = [];
        if (ticketId) {
            query += ' WHERE ticket_id = ?';
            params.push(ticketId);
        }
        query += ' ORDER BY created_at DESC';

        const rows = await this.db.all(query, params);
        return rows.map((r: any) => ({
            review_id: r.review_id,
            ticket_id: r.ticket_id,
            reviewer_profile_id: r.reviewer_profile_id,
            reviewer_role: r.reviewer_role,
            decision: r.decision,
            confidence: r.confidence,
            notes: r.notes,
            created_at: r.created_at
        }));
    }

    public async hasApprovedReview(ticketId: string): Promise<boolean> {
        await this.initPromise;
        if (!this.db) throw new Error('Review DB not initialized');

        const row = await this.db.get(
            `SELECT COUNT(*) as cnt FROM ticket_reviews
             WHERE ticket_id = ? AND decision = 'approved' AND confidence >= 0.9`,
            ticketId
        );
        return (row?.cnt || 0) > 0;
    }
}

export const reviewService = new ReviewService();
