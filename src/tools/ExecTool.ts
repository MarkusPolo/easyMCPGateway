import { execSync } from 'child_process';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class ExecTool extends BaseTool {
    name = 'exec';
    description = 'Executes a shell command in the workspace directory.';
    category = "System Operations";

    inputSchema = {
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute.'
            },
            timeout_ms: {
                type: 'number',
                description: 'Optional timeout in milliseconds. Defaults to 30000 (30s).'
            }
        },
        required: ['command']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const command: string = args.command;

        if (!command) {
            return {
                content: [{ type: "text", text: 'No command provided' }],
                isError: true
            };
        }

        const timeoutMs = args.timeout_ms || 30000;
        const workspaceRoot = scopePath('.');

        try {
            const stdout = execSync(command, {
                cwd: workspaceRoot,
                timeout: timeoutMs,
                maxBuffer: 1024 * 1024, // 1MB
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        stdout: stdout.toString().substring(0, 10000), // Cap output
                        stderr: '',
                        exit_code: 0
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            const isTimeout = error.code === 'ETIMEDOUT';
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        stdout: (error.stdout || '').toString().substring(0, 10000),
                        stderr: (error.stderr || '').toString().substring(0, 5000),
                        exit_code: error.status || (isTimeout ? 124 : 1),
                        error: isTimeout ? `Command timed out after ${timeoutMs}ms` : error.message
                    }, null, 2)
                }],
                isError: error.status !== 0
            };
        }
    }
}
