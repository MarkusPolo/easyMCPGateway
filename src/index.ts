import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ToolManager } from "./ToolManager";
import { startAdminServer } from "./adminServer";
import { schedulerService } from "./services/SchedulerService";
import { agentRuntimeService } from "./services/AgentRuntimeService";
import { onboardingService } from "./services/OnboardingService";
import { companyBootstrapService } from "./services/CompanyBootstrapService";
import { leaderLockService } from "./services/LeaderLockService";
import { systemControlService } from "./services/SystemControlService";
import * as crypto from 'crypto';

async function main() {
    const instanceId = crypto.randomUUID();
    const server = new Server(
        { name: "easy-mcp-gateway", version: "1.0.0" },
        { capabilities: { tools: {} } }
    );

    const toolManager = new ToolManager();
    await toolManager.loadTools();

    toolManager.registerWithMcp(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Start HTTP Admin interface on port 8080
    startAdminServer(toolManager, 8080);

    // Ensure CEO onboarding is initialized once at startup
    try {
        const onboarding = await onboardingService.ensureOnboardingInitialized();
        console.error(`[Onboarding] status=${onboarding.status}`);
    } catch (error) {
        console.error('[Onboarding] initialization failed:', error);
    }

    // Ensure supervisor profile and mandatory advisor workers exist
    try {
        const bootstrap = await companyBootstrapService.ensureSupervisorAndCoreWorkers(toolManager);
        console.error(`[Bootstrap] supervisorProfileId=${bootstrap.supervisorProfileId || 'n/a'}`);
    } catch (error) {
        console.error('[Bootstrap] failed:', error);
    }


    // Optional auto-start for unattended deployments
    if (process.env.SYSTEM_AUTO_START === 'true') {
        await systemControlService.start('system:auto');
    }

    const schedulerEnabled = process.env.SCHEDULER_ENABLED !== 'false';
    if (schedulerEnabled) {
        const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS || 60_000);
        setInterval(() => {
            systemControlService.getState().then((state) => {
                if (!state.is_running) return;
                return leaderLockService.acquire('scheduler', instanceId, Math.max(30_000, intervalMs * 2)).then((acquired) => {
                    if (!acquired) return;
                    schedulerService.runMaintenanceTick().catch((err) => {
                        console.error('Scheduler tick failed:', err);
                    });
                });
            }).catch((err) => console.error('Scheduler lock failed:', err));
        }, intervalMs);
    }

    const runtimeEnabled = process.env.AGENT_RUNTIME_ENABLED !== 'false';
    if (runtimeEnabled) {
        const runtimeIntervalMs = Number(process.env.AGENT_RUNTIME_INTERVAL_MS || 60_000);
        setInterval(() => {
            systemControlService.getState().then((state) => {
                if (!state.is_running) return;
                return leaderLockService.acquire('agent-runtime', instanceId, Math.max(30_000, runtimeIntervalMs * 2)).then((acquired) => {
                    if (!acquired) return;
                    agentRuntimeService.runWakeTick().catch((err) => {
                        console.error('Agent runtime tick failed:', err);
                    });
                });
            }).catch((err) => console.error('Runtime lock failed:', err));
        }, runtimeIntervalMs);
    }

    console.error("MCP Server running on stdio with dynamic tools structure.");
}

main().catch(console.error);
