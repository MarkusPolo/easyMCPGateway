import { spawn, ChildProcess } from 'child_process';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { getProfileWorkspaceRoot } from '../utils/pathUtils';

interface ManagedProcess {
    pid: number;
    process: ChildProcess;
    output: string[];
    startedAt: string;
    command: string;
    profileId: string;
}

const activeProcessesByProfile: Map<string, Map<number, ManagedProcess>> = new Map();

export class ProcessTool extends BaseTool {
    name = 'process';
    description = 'Manages background processes: start, stop, poll, list.';
    category = "System Operations";

    inputSchema = {
        properties: {
            action: {
                type: 'string',
                enum: ['start', 'stop', 'poll', 'list'],
                description: 'The operation to perform.'
            },
            command: {
                type: 'string',
                description: 'Command to run (required for start action).'
            },
            pid: {
                type: 'number',
                description: 'Process ID (required for stop and poll actions).'
            }
        },
        required: ['action']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const action: string = args.action;
        const effectiveProfileId = profileId || 'default';

        try {
            let result;
            switch (action) {
                case 'start': result = this.startProcess(args.command, effectiveProfileId); break;
                case 'stop': result = this.stopProcess(args.pid, effectiveProfileId); break;
                case 'poll': result = this.pollProcess(args.pid, effectiveProfileId); break;
                case 'list': result = this.listProcesses(effectiveProfileId); break;
                default:
                    throw new Error(`Unknown process action: ${action}. Use: start, stop, poll, list`);
            }

            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Process action failed: ${error.message}` }],
                isError: true
            };
        }
    }

    private getOrCreateProcessMap(profileId: string): Map<number, ManagedProcess> {
        let byPid = activeProcessesByProfile.get(profileId);
        if (!byPid) {
            byPid = new Map<number, ManagedProcess>();
            activeProcessesByProfile.set(profileId, byPid);
        }
        return byPid;
    }

    private startProcess(command: string, profileId: string) {
        if (!command) throw new Error('No command provided');
        const byPid = this.getOrCreateProcessMap(profileId);
        const workspaceRoot = getProfileWorkspaceRoot(profileId);

        const child = spawn(command, [], {
            cwd: workspaceRoot,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const output: string[] = [];
        child.stdout?.on('data', (data) => output.push(data.toString()));
        child.stderr?.on('data', (data) => output.push(`[stderr] ${data.toString()}`));

        const managed: ManagedProcess = {
            pid: child.pid as number,
            process: child,
            output,
            startedAt: new Date().toISOString(),
            command,
            profileId
        };

        byPid.set(child.pid as number, managed);

        child.on('exit', () => {
            // Keep in map for polling, but mark done
        });

        return { pid: child.pid, status: 'started', command, profile_id: profileId, workspace_root: workspaceRoot };
    }

    private stopProcess(pid: number, profileId: string) {
        if (!pid) throw new Error('PID required for stop action');
        const byPid = this.getOrCreateProcessMap(profileId);
        const managed = byPid.get(pid);
        if (!managed) throw new Error(`Process ${pid} not found`);

        managed.process.kill('SIGTERM');
        byPid.delete(pid);
        return { pid, status: 'stopped', profile_id: profileId };
    }

    private pollProcess(pid: number, profileId: string) {
        if (!pid) throw new Error('PID required for poll action');
        const byPid = this.getOrCreateProcessMap(profileId);
        const managed = byPid.get(pid);
        if (!managed) throw new Error(`Process ${pid} not found`);

        const exited = managed.process.exitCode !== null;
        return {
            pid,
            profile_id: profileId,
            status: exited ? 'exited' : 'running',
            exit_code: managed.process.exitCode,
            output: managed.output.slice(-20).join(''),
            started_at: managed.startedAt
        };
    }

    private listProcesses(profileId: string) {
        const byPid = this.getOrCreateProcessMap(profileId);
        const list = Array.from(byPid.values()).map(p => ({
            pid: p.pid,
            command: p.command,
            status: p.process.exitCode !== null ? 'exited' : 'running',
            started_at: p.startedAt
        }));
        return { profile_id: profileId, processes: list, total: list.length };
    }
}
