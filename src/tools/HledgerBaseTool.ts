import { execSync } from 'child_process';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

export abstract class HledgerBaseTool extends BaseTool {
    category = "Accounting";

    protected getHledgerPath(): string {
        const hPath = process.env.HLEDGER_PATH || 'hledger';
        console.error(`- HLEDGER_PATH from env: [${process.env.HLEDGER_PATH}]`);
        // If it looks like a relative path, resolve it relative to workspace
        if (hPath !== 'hledger' && !path.isAbsolute(hPath)) {
            const resolved = path.resolve(process.cwd(), hPath);
            console.error(`- Resolved hledger path: [${resolved}]`);
            return resolved;
        }
        return hPath;
    }

    protected getJournalPath(): string {
        const journalPath = process.env.HLEDGER_JOURNAL || 'data/accounting.journal';
        // Resolve absolute path relative to process.cwd()
        const absolutePath = path.isAbsolute(journalPath) ? journalPath : path.resolve(process.cwd(), journalPath);
        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return absolutePath;
    }

    protected isLocked(date: string): { locked: boolean; reason?: string } {
        const settingsPath = path.resolve(process.cwd(), 'data/accounting/settings.json');
        if (!fs.existsSync(settingsPath)) return { locked: false };

        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.lockDate && date <= settings.lockDate) {
                return {
                    locked: true,
                    reason: `The date ${date} is within a locked period (up to ${settings.lockDate}). Booking refers to posting date.`
                };
            }
        } catch (e) {
            console.error("Error checking lock date:", e);
        }
        return { locked: false };
    }

    protected findTransactionById(id: string): { found: boolean; description?: string; raw?: string } {
        // Search in journal for the ID tag
        // We use hledger print with a query that filters by the tag
        const res = this.runHledger(['print', `tag:id=${id}`]);
        if (!res.isError && res.content && res.content[0] && res.content[0].text) {
            const raw = res.content[0].text.trim();
            if (raw) {
                const lines = raw.split('\n');
                const description = lines[0].substring(11).split(';')[0].trim();
                return { found: true, description, raw };
            }
        }

        // Also check for external ID
        const resExt = this.runHledger(['print', `tag:ext=${id}`]);
        if (!resExt.isError && resExt.content && resExt.content[0] && resExt.content[0].text) {
            const raw = resExt.content[0].text.trim();
            if (raw) {
                const lines = raw.split('\n');
                const description = lines[0].substring(11).split(';')[0].trim();
                return { found: true, description, raw };
            }
        }

        return { found: false };
    }

    protected runHledger(args: string[]): ToolResponse {
        const hledgerPath = this.getHledgerPath();
        const journalPath = this.getJournalPath();

        const fullArgs = ['-f', journalPath, ...args];

        try {
            // Use spawning with shell: powershell.exe on Windows to handle paths with spaces and & operator
            const command = `& "${hledgerPath}" ${fullArgs.map(arg => `"${arg}"`).join(' ')}`;
            console.error(`- Executing: ${command}`);

            const stdout = execSync(command, {
                shell: 'powershell.exe',
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024,
            });

            return {
                content: [{ type: "text", text: stdout }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: "text",
                    text: `Error executing hledger: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`
                }],
                isError: true
            };
        }
    }
}
