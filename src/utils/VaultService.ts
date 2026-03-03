import * as fs from "fs";
import * as path from "path";

type SessionStatus = "success" | "error";

export class VaultService {
    private vaultRoot: string;

    constructor() {
        this.vaultRoot = path.resolve(process.cwd(), "data", "vaults");
        fs.mkdirSync(this.vaultRoot, { recursive: true });
    }

    public appendMemoryEntry(profileId: string, text: string, metadata: Record<string, any> = {}): void {
        const now = new Date();
        const profileDir = this.getProfileDir(profileId);
        this.ensureMemoryFile(profileDir, profileId);

        const memoryPath = path.join(profileDir, "MEMORY.md");
        const timestamp = now.toISOString();
        const metaJson = this.toSingleLineJson(metadata);

        const entry = [
            "",
            `## ${timestamp}`,
            "",
            `- metadata: \`${metaJson}\``,
            "",
            "```text",
            text,
            "```",
            ""
        ].join("\n");

        fs.appendFileSync(memoryPath, entry, "utf-8");
    }

    public appendSessionEvent(
        profileId: string,
        profileName: string,
        toolName: string,
        args: Record<string, any>,
        resultText: string,
        status: SessionStatus,
        durationMs: number
    ): void {
        const now = new Date();
        const profileDir = this.getProfileDir(profileId);
        const dailyDir = path.join(profileDir, "daily");
        fs.mkdirSync(dailyDir, { recursive: true });

        const date = now.toISOString().slice(0, 10);
        const dailyPath = path.join(dailyDir, `${date}.md`);
        this.ensureDailyFile(dailyPath, date, profileId, profileName);

        const timestamp = now.toISOString();
        const safeArgs = this.toSingleLineJson(args);
        const summary = this.truncateSingleLine(resultText, 300);

        const eventBlock = [
            "",
            `## ${timestamp} - ${toolName}`,
            "",
            `- status: ${status}`,
            `- duration_ms: ${durationMs}`,
            `- args: \`${safeArgs}\``,
            `- result: \`${summary}\``,
            ""
        ].join("\n");

        fs.appendFileSync(dailyPath, eventBlock, "utf-8");
    }

    private getProfileDir(profileId: string): string {
        const safeProfileId = this.sanitizeProfileId(profileId);
        const profileDir = path.join(this.vaultRoot, safeProfileId);
        fs.mkdirSync(profileDir, { recursive: true });
        return profileDir;
    }

    private ensureMemoryFile(profileDir: string, profileId: string): void {
        const memoryPath = path.join(profileDir, "MEMORY.md");
        if (fs.existsSync(memoryPath)) {
            return;
        }

        const content = [
            "# Memory Vault",
            "",
            `- profile_id: ${profileId}`,
            `- generated_at: ${new Date().toISOString()}`,
            "",
            "## Entries",
            ""
        ].join("\n");

        fs.writeFileSync(memoryPath, content, "utf-8");
    }

    private ensureDailyFile(dailyPath: string, date: string, profileId: string, profileName: string): void {
        if (fs.existsSync(dailyPath)) {
            return;
        }

        const content = [
            `# Session History - ${date}`,
            "",
            `- profile_id: ${profileId}`,
            `- profile_name: ${profileName}`,
            `- generated_at: ${new Date().toISOString()}`,
            "",
            "## Events",
            ""
        ].join("\n");

        fs.writeFileSync(dailyPath, content, "utf-8");
    }

    private sanitizeProfileId(profileId: string): string {
        const trimmed = (profileId || "default").trim();
        const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
        return sanitized || "default";
    }

    private toSingleLineJson(input: unknown): string {
        try {
            return JSON.stringify(input ?? {});
        } catch {
            return '{"error":"failed_to_serialize"}';
        }
    }

    private truncateSingleLine(value: string, limit: number): string {
        const singleLine = (value || "").replace(/\s+/g, " ").trim();
        if (singleLine.length <= limit) {
            return singleLine;
        }
        return `${singleLine.slice(0, limit)}... [truncated]`;
    }
}

export const vaultService = new VaultService();
