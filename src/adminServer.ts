import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { ToolManager } from './ToolManager';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function startAdminServer(toolManager: ToolManager, port: number = 8080) {
    const app = express();

    app.use(cors());

    // Only apply JSON parser to non-message routes
    // handlePostMessage consumes the raw request stream natively
    app.use((req, res, next) => {
        if (req.path === '/mcp/message') {
            next();
        } else {
            express.json()(req, res, next);
        }
    });

    // Serve static files from the 'public' directory
    const publicDir = path.join(process.cwd(), 'public');
    app.use(express.static(publicDir));

    // --- Profile Management API ---
    app.get('/api/profiles', (req, res) => {
        res.json(toolManager.getProfiles());
    });

    app.post('/api/profiles', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });
        const newProfile = toolManager.createProfile(name);
        res.json(newProfile);
    });

    app.delete('/api/profiles/:id', (req, res) => {
        const success = toolManager.deleteProfile(req.params.id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Cannot delete profile." });
        }
    });

    app.post('/api/profiles/:id/regenerate', (req, res) => {
        const token = toolManager.regenerateToken(req.params.id);
        if (token) {
            res.json({ success: true, token });
        } else {
            res.status(404).json({ error: "Profile not found." });
        }
    });

    // --- Tool Management API (Scoped by Profile) ---
    app.get('/api/tools', (req, res) => {
        try {
            const profileId = (req.query.profileId as string) || 'default';
            const tools = toolManager.getToolStates(profileId);
            res.json(tools);
        } catch (e: any) {
            res.status(404).json({ error: e.message });
        }
    });

    app.post('/api/tools/:name/toggle', (req, res) => {
        const name = req.params.name;
        const { isEnabled, profileId = 'default' } = req.body;

        if (typeof isEnabled !== 'boolean') {
            return res.status(400).json({ error: "Invalid payload. 'isEnabled' must be a boolean." });
        }

        const success = toolManager.setToolState(profileId, name, isEnabled);

        if (success) {
            res.json({ success: true, name, isEnabled });
        } else {
            res.status(404).json({ error: `Tool ${name} not found or invalid profile.` });
        }
    });

    app.post('/api/categories/:name/toggle', (req, res) => {
        const categoryName = req.params.name;
        const { isEnabled, profileId = 'default' } = req.body;

        if (typeof isEnabled !== 'boolean') {
            return res.status(400).json({ error: "Invalid payload. 'isEnabled' must be a boolean." });
        }

        const success = toolManager.setCategoryState(profileId, categoryName, isEnabled);

        if (success) {
            res.json({ success: true, category: categoryName, isEnabled });
        } else {
            res.status(404).json({ error: `Category ${categoryName} not found or invalid profile.` });
        }
    });

    app.post('/api/tools/:name/execute', async (req, res) => {
        const name = req.params.name;
        const profileId = req.query.profileId as string || 'default';
        const args = req.body || {};

        try {
            const result = await toolManager.executeTool(name, args, profileId);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Execution failed' });
        }
    });

    // --- Audit & Analytics API ---
    app.get('/api/audit/logs', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const logger = toolManager.getAuditLogger();
            const logs = await logger.getRecentLogs(limit, offset);
            res.json(logs);
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to fetch audit logs' });
        }
    });

    app.get('/api/audit/analytics', async (req, res) => {
        try {
            const logger = toolManager.getAuditLogger();
            const analytics = await logger.getAnalytics();
            res.json(analytics);
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to fetch analytics' });
        }
    });

    // --- MCP Server-Sent Events (SSE) Multi-Tenant Transport ---
    const transports = new Map<string, SSEServerTransport>();
    const activeConnections = new Map<string, { sessionId: string; profileId: string; profileName: string; connectedAt: string }>();

    app.get('/api/connections', (req, res) => {
        res.json(Array.from(activeConnections.values()));
    });

    app.get('/mcp/sse', async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).send('Unauthorized. Provide a valid Bearer token.');
            return;
        }

        const token = authHeader.split(' ')[1];
        const profile = toolManager.getProfileByToken(token);

        if (!profile) {
            res.status(403).send('Forbidden: Invalid Token');
            return;
        }

        console.log(`[MCP SSE] Incoming connection authenticated as: ${profile.name}`);

        const transport = new SSEServerTransport("/mcp/message", res);

        // Spawn isolated server instance
        const mcpServer = new Server({ name: profile.name, version: "1.0.0" }, { capabilities: { tools: {} } });
        toolManager.registerWithMcp(mcpServer, profile.id);

        await mcpServer.connect(transport);
        transports.set(transport.sessionId, transport);
        activeConnections.set(transport.sessionId, {
            sessionId: transport.sessionId,
            profileId: profile.id,
            profileName: profile.name,
            connectedAt: new Date().toISOString()
        });

        res.on('close', () => {
            console.log(`[MCP SSE] Connection closed for: ${profile.name}`);
            transports.delete(transport.sessionId);
            activeConnections.delete(transport.sessionId);
        });
    });

    app.post('/mcp/message', async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports.get(sessionId);
        if (!transport) {
            res.status(404).send('Session not found');
            return;
        }
        await transport.handlePostMessage(req, res);
    });

    // Fallback for SPA
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    app.listen(port, () => {
        console.error(`Admin Interface running on http://localhost:${port}`);
        console.error(`MCP SSE Endpoint running at http://localhost:${port}/mcp/sse`);
    });
}
