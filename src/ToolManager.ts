import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ITool, ToolResponse } from "./tools/types";
import {
    CalculatorTool,
    ReadFileTool,
    WriteFileTool,
    EditFileTool,
    ApplyPatchTool,
    GrepTool,
    FindTool,
    LsTool,
    ExecTool,
    ProcessTool,
    WebFetchTool,
    WebSearchTool
} from "./tools";

import * as fs from 'fs';
import * as path from 'path';
import { AuditLogger } from "./audit/AuditLogger";
import { encode } from 'gpt-tokenizer';
import * as crypto from 'crypto';

export interface Profile {
    id: string;
    name: string;
    token: string;
    enabledTools: Record<string, boolean>;
}

export class ToolManager {
    private tools: Map<string, ITool> = new Map();
    private profiles: Profile[] = [];
    private configPath: string;
    private logger: AuditLogger;

    constructor() {
        this.configPath = path.resolve(process.cwd(), 'profiles-config.json');
        this.logger = new AuditLogger();
        this.loadConfig();
    }

    private loadConfig() {
        if (fs.existsSync(this.configPath)) {
            try {
                this.profiles = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            } catch (e) {
                console.error("Error reading profiles-config.json:", e);
                this.initDefaultProfile();
            }
        } else {
            this.initDefaultProfile();
        }
    }

    private initDefaultProfile() {
        this.profiles = [
            {
                id: 'default',
                name: 'Local Admin',
                token: 'mcp-default-' + crypto.randomBytes(8).toString('hex'),
                enabledTools: {}
            }
        ];
        this.saveConfig();

        // Also cleanup legacy tools-config if it exists
        const legacyPath = path.resolve(process.cwd(), 'tools-config.json');
        if (fs.existsSync(legacyPath)) {
            try {
                const legacyConfig = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
                this.profiles[0].enabledTools = legacyConfig;
                this.saveConfig();
            } catch (e) { }
        }
    }

    private saveConfig() {
        fs.writeFileSync(this.configPath, JSON.stringify(this.profiles, null, 2), 'utf-8');
    }

    public async loadTools() {
        // Register all tools
        this.registerTool(new CalculatorTool());
        this.registerTool(new ReadFileTool());
        this.registerTool(new WriteFileTool());
        this.registerTool(new EditFileTool());
        this.registerTool(new ApplyPatchTool());
        this.registerTool(new GrepTool());
        this.registerTool(new FindTool());
        this.registerTool(new LsTool());
        this.registerTool(new ExecTool());
        this.registerTool(new ProcessTool());
        this.registerTool(new WebFetchTool());
        this.registerTool(new WebSearchTool());

        // Ensure all registered tools have a state in all profiles
        let configChanged = false;
        for (const profile of this.profiles) {
            for (const name of this.tools.keys()) {
                if (profile.enabledTools[name] === undefined) {
                    profile.enabledTools[name] = true; // default to enabled
                    configChanged = true;
                }
            }
        }
        if (configChanged) {
            this.saveConfig();
        }
    }

    public registerTool(tool: ITool) {
        this.tools.set(tool.definition().name, tool);
    }

    public getAuditLogger() {
        return this.logger;
    }

    // Profile Management API
    public getProfiles() {
        return this.profiles;
    }

    public getProfileById(id: string): Profile | undefined {
        return this.profiles.find(p => p.id === id);
    }

    public getProfileByToken(token: string): Profile | undefined {
        return this.profiles.find(p => p.token === token);
    }

    public createProfile(name: string): Profile {
        const newProfile: Profile = {
            id: crypto.randomUUID(),
            name,
            token: 'mcp-' + crypto.randomBytes(16).toString('hex'),
            enabledTools: {}
        };
        for (const toolName of this.tools.keys()) {
            newProfile.enabledTools[toolName] = true; // Enabled by default
        }
        this.profiles.push(newProfile);
        this.saveConfig();
        return newProfile;
    }

    public deleteProfile(id: string) {
        if (id === 'default') return false; // Cannot delete default profile
        const initialLen = this.profiles.length;
        this.profiles = this.profiles.filter(p => p.id !== id);
        if (this.profiles.length < initialLen) {
            this.saveConfig();
            return true;
        }
        return false;
    }

    public regenerateToken(id: string): string | null {
        const profile = this.getProfileById(id);
        if (profile) {
            profile.token = 'mcp-' + crypto.randomBytes(16).toString('hex');
            this.saveConfig();
            return profile.token;
        }
        return null;
    }

    // Tools Management API (requires profileId)
    public getToolStates(profileId: string) {
        const profile = this.getProfileById(profileId);
        if (!profile) throw new Error("Profile not found");

        return Array.from(this.tools.values()).map(tool => {
            const def = tool.definition();
            return {
                name: def.name,
                description: def.description,
                category: def.category,
                inputSchema: def.inputSchema,
                isEnabled: profile.enabledTools[def.name] ?? true
            };
        });
    }

    public setToolState(profileId: string, name: string, isEnabled: boolean) {
        const profile = this.getProfileById(profileId);
        if (profile && this.tools.has(name)) {
            profile.enabledTools[name] = isEnabled;
            this.saveConfig();
            return true;
        }
        return false;
    }

    public setCategoryState(profileId: string, category: string, isEnabled: boolean) {
        const profile = this.getProfileById(profileId);
        if (!profile) return false;

        let changed = false;
        for (const tool of this.tools.values()) {
            const def = tool.definition();
            if (def.category === category) {
                profile.enabledTools[def.name] = isEnabled;
                changed = true;
            }
        }

        if (changed) {
            this.saveConfig();
            return true;
        }
        return false;
    }

    private async _executeWithLogging(tool: ITool, name: string, args: Record<string, any>, profileName: string): Promise<ToolResponse> {
        const start = Date.now();
        let result: ToolResponse;
        let isError = false;
        let resultText = "";

        try {
            result = await tool.execute(args);
            isError = !!result.isError;
            // Best effort capture of response payload for logs
            if (result.content && result.content.length > 0) {
                resultText = result.content[0].text || "Binary/Resource output";
            }
        } catch (error: any) {
            isError = true;
            resultText = error.message;
            result = {
                content: [{ type: "text", text: resultText }],
                isError: true
            };
        }

        const duration = Date.now() - start;

        // Truncate values to avoid bloating DB
        const paramStr = JSON.stringify(args) || "{}";
        const trimmedResult = resultText.length > 500 ? resultText.substring(0, 500) + '... [truncated]' : resultText;

        // Calculate Tokens (Input + Output)
        let tokenUsage = 0;
        try {
            tokenUsage = encode(paramStr).length + encode(resultText).length;
        } catch (e) {
            console.warn("Failed to calculate token usage:", e);
        }

        // Fire and forget
        this.logger.logExecution({
            tool_name: name,
            parameters: paramStr,
            result: trimmedResult,
            is_error: isError,
            duration_ms: duration,
            token_usage: tokenUsage,
            profile_name: profileName
        }).catch(console.error);

        return result;
    }

    // Direct execution for Admin UI Testing without MCP protocol overhead
    public async executeTool(name: string, args: Record<string, any>, profileId: string = 'default') {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        const profile = this.getProfileById(profileId);
        const executorName = profile ? `${profile.name} (Web Testing)` : 'Unknown (Web Testing)';
        // Admin UI testing allows testing even if disabled via MCP
        return await this._executeWithLogging(tool, name, args, executorName);
    }

    public registerWithMcp(server: Server, profileId: string = 'default') {
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            const profile = this.getProfileById(profileId);
            return {
                tools: Array.from(this.tools.values())
                    .filter(t => profile?.enabledTools[t.definition().name] !== false)
                    .map(t => t.definition()),
            };
        });

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const profile = this.getProfileById(profileId);
            const name = request.params.name;
            const tool = this.tools.get(name);

            if (!tool) {
                throw new Error(`Tool not found: ${name}`);
            }

            if (profile?.enabledTools[name] === false) {
                throw new Error(`Tool ${name} is currently disabled by the administrator.`);
            }

            const args = request.params.arguments || {};
            const result = await this._executeWithLogging(tool, name, args, profile?.name || 'Unknown');

            return {
                content: result.content,
                isError: result.isError,
            };
        });
    }
}
