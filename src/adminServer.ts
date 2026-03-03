import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { ToolManager } from './ToolManager';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { workerService } from './services/WorkerService';
import * as fs from 'fs';
import { onboardingService } from './services/OnboardingService';
import { supervisorContextService } from './services/SupervisorContextService';
import { opsService } from './services/OpsService';
import { workerRunService } from './services/WorkerRunService';
import { reviewService } from './services/ReviewService';
import { ticketService } from './services/TicketService';
import { codexOAuthService } from './services/CodexOAuthService';
import { systemControlService } from './services/SystemControlService';

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

    app.get('/oauth/codex/callback', async (req, res) => {
        try {
            const code = req.query.code as string | undefined;
            const state = req.query.state as string | undefined;
            const redirectUri = `${req.protocol}://${req.get('host')}/oauth/codex/callback`;

            if (!code || !state) {
                return res.status(400).send('Missing code/state from OAuth callback.');
            }

            await codexOAuthService.handleCallback({ code, state, redirectUri });
            res.send('<html><body style="font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:24px;"><h2>Codex OAuth connected ✅</h2><p>You can close this window and return to the dashboard.</p></body></html>');
        } catch (error: any) {
            res.status(500).send(`OAuth callback failed: ${error?.message || 'unknown error'}`);
        }
    });

    // API authentication + minimal authorization hardening
    app.use('/api', (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized. Missing Bearer token.' });
        }

        const token = authHeader.split(' ')[1];
        const profile = toolManager.getProfileByToken(token);
        if (!profile) {
            return res.status(403).json({ error: 'Forbidden. Invalid token.' });
        }

        (req as any).authProfile = profile;
        next();
    });

    const requirePrivileged = (req: any, res: any, next: any) => {
        const authProfile = req.authProfile;
        if (!authProfile || !toolManager.isPrivilegedProfile(authProfile.id)) {
            return res.status(403).json({ error: 'Forbidden. Privileged profile required.' });
        }
        next();
    };

    const getRole = (profile: any): 'investor' | 'supervisor' | 'advisor' | 'worker' => {
        const n = String(profile?.name || '').toLowerCase();
        if (n.includes('marius') || n.includes('investor')) return 'investor';
        if (toolManager.isPrivilegedProfile(profile?.id)) return 'supervisor';
        if (n.includes('advisor') || n.includes('accountant')) return 'advisor';
        return 'worker';
    };

    const requireRoles = (roles: Array<'investor' | 'supervisor' | 'advisor' | 'worker'>) => (req: any, res: any, next: any) => {
        const role = getRole(req.authProfile);
        if (!roles.includes(role)) {
            return res.status(403).json({ error: `Forbidden. Required roles: ${roles.join(', ')}` });
        }
        next();
    };

    // --- Profile Management API ---
    app.get('/api/profiles', (req, res) => {
        res.json(toolManager.getProfiles());
    });

    app.post('/api/profiles', requirePrivileged, (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });
        const newProfile = toolManager.createProfile(name);
        res.json(newProfile);
    });

    app.get('/api/llm/codex/status', async (req, res) => {
        try {
            const status = await codexOAuthService.getStatus();
            res.json(status);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to read Codex auth status' });
        }
    });

    app.post('/api/llm/codex/oauth/start', requireRoles(['supervisor']), async (req, res) => {
        try {
            const redirectUri = `${req.protocol}://${req.get('host')}/oauth/codex/callback`;
            const { authorizationUrl } = await codexOAuthService.buildAuthorizationUrl(redirectUri);
            res.json({ authorizationUrl, redirectUri });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to start OAuth flow' });
        }
    });

    app.post('/api/llm/codex/oauth/manual', requireRoles(['supervisor']), async (req, res) => {
        try {
            const { access_token, refresh_token, expires_in } = req.body || {};
            if (!access_token) return res.status(400).json({ error: 'access_token is required' });

            await codexOAuthService.storeTokens({
                accessToken: String(access_token),
                refreshToken: refresh_token ? String(refresh_token) : undefined,
                expiresIn: expires_in ? Number(expires_in) : undefined
            });

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to store OAuth token' });
        }
    });

    app.get('/api/system/status', async (req, res) => {
        try {
            const [system, codex] = await Promise.all([
                systemControlService.getState(),
                codexOAuthService.getStatus()
            ]);
            res.json({
                is_running: system.is_running,
                started_at: system.started_at || null,
                started_by: system.started_by || null,
                codex_connected: codex.connected
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to read system status' });
        }
    });

    app.post('/api/system/start', requireRoles(['supervisor']), async (req, res) => {
        try {
            const codex = await codexOAuthService.getStatus();
            if (!codex.connected) {
                return res.status(400).json({ error: 'Codex OAuth is not connected. Connect Codex before starting operations.' });
            }

            const actor = req.authProfile?.name || req.authProfile?.id || 'unknown';
            const state = await systemControlService.start(String(actor));
            res.json({ success: true, state });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to start system' });
        }
    });

    // --- Worker Management API ---
    app.get('/api/workers', async (req, res) => {
        try {
            const status = req.query.status as 'active' | 'fired' | undefined;
            const workers = await workerService.listWorkers(status);
            res.json(workers);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to list workers' });
        }
    });

    app.get('/api/tickets', async (req, res) => {
        try {
            const status = req.query.status as string | undefined;
            const category = req.query.category as string | undefined;
            const targetRole = req.query.target_role_hint as string | undefined;
            const tickets = await ticketService.listTickets({ status, category, target_role_hint: targetRole });
            res.json(tickets);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to list tickets' });
        }
    });

    app.post('/api/workers/hire', requireRoles(['supervisor']), async (req, res) => {
        try {
            const { worker_name, role, allowed_tools, job_posting, job_posting_path, principles_path = 'principles.md', wake_interval_minutes = 30 } = req.body;
            if (!worker_name || !role || !Array.isArray(allowed_tools)) {
                return res.status(400).json({ error: 'worker_name, role, allowed_tools are required.' });
            }

            let posting = job_posting || '';
            if (!posting && job_posting_path) {
                posting = fs.readFileSync(path.resolve(process.cwd(), job_posting_path), 'utf-8');
            }
            if (!posting) {
                return res.status(400).json({ error: 'job_posting or job_posting_path is required.' });
            }

            const principlesFile = path.resolve(process.cwd(), principles_path);
            const principles = fs.existsSync(principlesFile)
                ? fs.readFileSync(principlesFile, 'utf-8')
                : 'No principles.md found.';

            const profile = toolManager.createProfileWithTools(worker_name, allowed_tools);
            const systemPrompt = ['# Company Principles', principles, '', '# Job Posting', posting].join('\n');

            const worker = await workerService.hireWorker({
                profile_id: profile.id,
                name: worker_name,
                role,
                system_prompt: systemPrompt,
                allowed_tools,
                wake_interval_minutes
            });

            res.json({ worker, profile_id: profile.id, bearer_token: profile.token });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to hire worker' });
        }
    });

    app.post('/api/workers/:id/fire', requireRoles(['supervisor']), async (req, res) => {
        try {
            const worker = await workerService.fireWorker(req.params.id);
            const revoked = toolManager.deleteProfile(worker.profile_id);
            res.json({ worker, profile_revoked: revoked });
        } catch (error: any) {
            res.status(400).json({ error: error.message || 'Failed to fire worker' });
        }
    });

    // --- Onboarding API ---
    app.get('/api/onboarding/status', (req, res) => {
        res.json(onboardingService.getStatus());
    });

    app.post('/api/onboarding/complete', requirePrivileged, (req, res) => {
        const state = onboardingService.markCompleted();
        res.json({ success: true, state });
    });

    app.get('/api/supervisor/context', async (req, res) => {
        try {
            const context = await supervisorContextService.buildLatestContext();
            res.json({ context });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to build supervisor context' });
        }
    });

    app.get('/api/reviews', async (req, res) => {
        try {
            const ticketId = req.query.ticketId as string | undefined;
            const reviews = await reviewService.listReviews(ticketId);
            res.json(reviews);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to list reviews' });
        }
    });

    app.get('/api/runs', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 100;
            const runs = await workerRunService.listRuns(limit);
            res.json(runs);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to list runs' });
        }
    });

    app.get('/api/health/live', (req, res) => {
        res.json(opsService.liveness());
    });

    app.get('/api/health/ready', async (req, res) => {
        const ready = await opsService.readiness();
        if (!ready.ok) return res.status(503).json(ready);
        res.json(ready);
    });

    app.get('/api/metrics', async (req, res) => {
        try {
            const metrics = await opsService.metrics();
            res.json(metrics);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to fetch metrics' });
        }
    });

    app.delete('/api/profiles/:id', requirePrivileged, (req, res) => {
        const success = toolManager.deleteProfile(req.params.id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Cannot delete profile." });
        }
    });

    app.post('/api/profiles/:id/regenerate', requirePrivileged, (req, res) => {
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

    app.post('/api/tools/:name/toggle', requirePrivileged, (req, res) => {
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

    app.post('/api/categories/:name/toggle', requirePrivileged, (req, res) => {
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
        const authProfile = (req as any).authProfile;

        if (authProfile.id !== profileId && !toolManager.isPrivilegedProfile(authProfile.id)) {
            return res.status(403).json({ error: 'Forbidden. Cannot execute tools for other profiles.' });
        }

        try {
            const result = await toolManager.executeTool(name, args, profileId);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Execution failed' });
        }
    });

    // --- Human in the Loop (HITL) API ---
    app.post('/api/tools/:name/approval', requirePrivileged, (req, res) => {
        const name = req.params.name;
        const { requiresApproval, profileId = 'default' } = req.body;

        if (typeof requiresApproval !== 'boolean') {
            return res.status(400).json({ error: "Invalid payload. 'requiresApproval' must be a boolean." });
        }

        const success = toolManager.setToolApproval(profileId, name, requiresApproval);

        if (success) {
            res.json({ success: true, name, requiresApproval });
        } else {
            res.status(404).json({ error: `Tool ${name} not found or invalid profile.` });
        }
    });

    app.get('/api/hitl/pending', (req, res) => {
        res.json(toolManager.getPendingApprovals());
    });

    app.post('/api/hitl/:id/approve', requirePrivileged, (req, res) => {
        const success = toolManager.approveRequest(req.params.id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Pending request not found.' });
        }
    });

    app.post('/api/hitl/:id/reject', requirePrivileged, (req, res) => {
        const reason = req.body?.reason;
        const success = toolManager.rejectRequest(req.params.id, reason);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Pending request not found.' });
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
