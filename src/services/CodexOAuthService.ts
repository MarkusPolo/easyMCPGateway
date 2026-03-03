import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';

interface OAuthSession {
    state: string;
    codeVerifier: string;
    createdAt: string;
}

export interface CodexAuthStatus {
    connected: boolean;
    provider: 'codex';
    oauth_configured: boolean;
    configured_redirect_uri?: string;
    updated_at?: string;
    expires_at?: string;
}

export class CodexOAuthService {
    private dbPath: string;
    private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
    private initPromise: Promise<void>;
    private pendingSessions = new Map<string, OAuthSession>();

    constructor() {
        this.dbPath = path.resolve(process.cwd(), 'llm-auth.db');
        this.initPromise = this.init();
    }

    private async init() {
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS llm_oauth_tokens (
                provider TEXT PRIMARY KEY,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at TEXT,
                updated_at TEXT NOT NULL
            )
        `);
    }

    private base64url(input: Buffer) {
        return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }


    private getOAuthConfig() {
        const authUrl = process.env.CODEX_OAUTH_AUTH_URL || 'https://auth.openai.com/oauth/authorize';
        const tokenUrl = process.env.CODEX_OAUTH_TOKEN_URL || '';
        const clientId = process.env.CODEX_OAUTH_CLIENT_ID || '';
        const configuredRedirectUri = process.env.CODEX_OAUTH_REDIRECT_URI || '';

        return {
            authUrl,
            tokenUrl,
            clientId,
            configuredRedirectUri,
            scope: process.env.CODEX_OAUTH_SCOPE || 'openid profile offline_access'
        };
    }

    private assertOAuthConfigured() {
        const cfg = this.getOAuthConfig();
        if (!cfg.clientId) {
            throw new Error('CODEX_OAUTH_CLIENT_ID is missing. Register an OAuth app and configure CODEX_OAUTH_CLIENT_ID first.');
        }
        if (!cfg.tokenUrl) {
            throw new Error('CODEX_OAUTH_TOKEN_URL is missing. Configure OAuth token endpoint before login.');
        }
        return cfg;
    }

    public async getStatus(): Promise<CodexAuthStatus> {
        await this.initPromise;
        if (!this.db) throw new Error('OAuth DB not initialized');
        const cfg = this.getOAuthConfig();
        const row = await this.db.get('SELECT provider, expires_at, updated_at FROM llm_oauth_tokens WHERE provider = ?', 'codex');
        if (!row) return { connected: false, provider: 'codex', oauth_configured: Boolean(cfg.clientId && cfg.tokenUrl), configured_redirect_uri: cfg.configuredRedirectUri || undefined };
        return {
            connected: true,
            provider: 'codex',
            oauth_configured: Boolean(cfg.clientId && cfg.tokenUrl),
            configured_redirect_uri: cfg.configuredRedirectUri || undefined,
            expires_at: row.expires_at || undefined,
            updated_at: row.updated_at
        };
    }

    public async buildAuthorizationUrl(redirectUri: string): Promise<{ authorizationUrl: string; state: string }> {
        const state = crypto.randomUUID();
        const verifier = this.base64url(crypto.randomBytes(32));
        const challenge = this.base64url(crypto.createHash('sha256').update(verifier).digest());

        this.pendingSessions.set(state, {
            state,
            codeVerifier: verifier,
            createdAt: new Date().toISOString()
        });

        const cfg = this.assertOAuthConfigured();
        const authBase = cfg.authUrl;
        const clientId = cfg.clientId;

        const url = new URL(authBase);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('scope', cfg.scope);
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('code_challenge', challenge);

        return { authorizationUrl: url.toString(), state };
    }

    public async handleCallback(params: { code: string; state: string; redirectUri: string }): Promise<void> {
        const cfg = this.assertOAuthConfigured();
        const tokenUrl = cfg.tokenUrl;

        const session = this.pendingSessions.get(params.state);
        if (!session) {
            throw new Error('Invalid OAuth state');
        }

        const clientId = cfg.clientId;
        const clientSecret = process.env.CODEX_OAUTH_CLIENT_SECRET;

        const body = new URLSearchParams();
        body.set('grant_type', 'authorization_code');
        body.set('client_id', clientId);
        body.set('code', params.code);
        body.set('redirect_uri', params.redirectUri);
        body.set('code_verifier', session.codeVerifier);
        if (clientSecret) body.set('client_secret', clientSecret);

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 300)}`);
        }

        const payload: any = await response.json();
        await this.storeTokens({
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            expiresIn: payload.expires_in
        });

        this.pendingSessions.delete(params.state);
    }

    public async storeTokens(input: { accessToken: string; refreshToken?: string; expiresIn?: number }): Promise<void> {
        await this.initPromise;
        if (!this.db) throw new Error('OAuth DB not initialized');
        if (!input.accessToken) throw new Error('accessToken is required');

        const now = new Date();
        const expiresAt = input.expiresIn
            ? new Date(now.getTime() + Number(input.expiresIn) * 1000).toISOString()
            : null;

        await this.db.run(
            `INSERT INTO llm_oauth_tokens (provider, access_token, refresh_token, expires_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(provider) DO UPDATE SET
                access_token=excluded.access_token,
                refresh_token=excluded.refresh_token,
                expires_at=excluded.expires_at,
                updated_at=excluded.updated_at`,
            'codex',
            input.accessToken,
            input.refreshToken || null,
            expiresAt,
            now.toISOString()
        );
    }
}

export const codexOAuthService = new CodexOAuthService();
