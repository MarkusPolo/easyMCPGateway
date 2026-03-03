import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface CodexAuthStatus {
    connected: boolean;
    provider: 'codex-sdk-device-auth';
    oauth_configured: boolean;
    configured_redirect_uri?: string;
    mode: 'device_code';
    active_login?: {
        started_at: string;
        verification_uri?: string;
        user_code?: string;
        completed?: boolean;
    };
    last_error?: string;
}

interface ActiveLogin {
    process: ChildProcess;
    startedAt: string;
    verificationUri?: string;
    userCode?: string;
    output: string;
    done: boolean;
    error?: string;
}

export class CodexOAuthService {
    private codexHome: string;
    private activeLogin: ActiveLogin | null = null;

    constructor() {
        this.codexHome = process.env.CODEX_SDK_HOME || path.resolve(process.cwd(), '.codex');
    }

    private ensureCodexHome() {
        if (!fs.existsSync(this.codexHome)) {
            fs.mkdirSync(this.codexHome, { recursive: true });
        }
    }


    private npxCommand(): string {
        if (process.platform === 'win32') return 'npx.cmd';
        return 'npx';
    }

    private codexEnv() {
        return {
            ...process.env,
            CODEX_HOME: this.codexHome,
            PATH: process.env.PATH || process.env.Path || process.env.path || ''
        };
    }

    private parseLoginOutput(login: ActiveLogin) {
        const urlMatch = login.output.match(/https:\/\/auth\.openai\.com\/codex\/device/);
        const codeMatch = login.output.match(/\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/);
        if (urlMatch) login.verificationUri = urlMatch[0];
        if (codeMatch) login.userCode = codeMatch[0];
    }

    private runCodex(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
        this.ensureCodexHome();
        return new Promise((resolve) => {
            const child = spawn(this.npxCommand(), ['-y', '@openai/codex', ...args], {
                env: this.codexEnv(),
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => (stdout += d.toString()));
            child.stderr.on('data', (d) => (stderr += d.toString()));
            child.on('error', (err) => {
                stderr += `spawn_error:${(err as Error).message}`;
                resolve({ code: 1, stdout, stderr });
            });
            child.on('close', (code) => resolve({ code, stdout, stderr }));
        });
    }

    public async getStatus(): Promise<CodexAuthStatus> {
        const result = await this.runCodex(['login', 'status']);
        const text = `${result.stdout}\n${result.stderr}`;
        const connected = /logged in|authenticated/i.test(text) && !/not logged in/i.test(text);
        const spawnError = /spawn_error:/i.test(text);

        return {
            connected,
            provider: 'codex-sdk-device-auth',
            oauth_configured: true,
            mode: 'device_code',
            active_login: this.activeLogin
                ? {
                    started_at: this.activeLogin.startedAt,
                    verification_uri: this.activeLogin.verificationUri,
                    user_code: this.activeLogin.userCode,
                    completed: this.activeLogin.done
                }
                : undefined,
            last_error: this.activeLogin?.error || (spawnError ? `Codex CLI not available in PATH on ${os.platform()}. Install Node/npm and ensure npx is available.` : undefined)
        };
    }

    public async startDeviceAuth(): Promise<{ verification_uri: string; user_code: string; mode: 'device_code' }> {
        if (this.activeLogin && !this.activeLogin.done) {
            if (this.activeLogin.verificationUri && this.activeLogin.userCode) {
                return {
                    verification_uri: this.activeLogin.verificationUri,
                    user_code: this.activeLogin.userCode,
                    mode: 'device_code'
                };
            }
            throw new Error('A Codex login is already in progress. Please wait a few seconds and retry.');
        }

        this.ensureCodexHome();
        const child = spawn(this.npxCommand(), ['-y', '@openai/codex', 'login', '--device-auth'], {
            env: this.codexEnv(),
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const login: ActiveLogin = {
            process: child,
            startedAt: new Date().toISOString(),
            output: '',
            done: false
        };
        this.activeLogin = login;

        child.stdout.on('data', (d) => {
            login.output += d.toString();
            this.parseLoginOutput(login);
        });
        child.stderr.on('data', (d) => {
            login.output += d.toString();
            this.parseLoginOutput(login);
        });
        child.on('error', (err) => {
            login.done = true;
            login.error = `Failed to spawn ${this.npxCommand()}: ${(err as Error).message}`;
        });
        child.on('close', (code) => {
            login.done = true;
            if (code !== 0) {
                login.error = `codex login exited with code ${code}`;
            }
        });

        const started = Date.now();
        while (Date.now() - started < 15_000) {
            this.parseLoginOutput(login);
            if (login.verificationUri && login.userCode) {
                return {
                    verification_uri: login.verificationUri,
                    user_code: login.userCode,
                    mode: 'device_code'
                };
            }
            if (login.done) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        throw new Error(login.error || `Failed to get device code from Codex CLI output. Output: ${login.output.slice(0, 600)}`);
    }
}

export const codexOAuthService = new CodexOAuthService();
