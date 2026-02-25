import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class LsTool extends BaseTool {
    name = 'ls';
    description = 'Lists contents of a directory in the workspace.';
    category = "File System";

    inputSchema = {
        properties: {
            path: {
                type: 'string',
                description: 'The directory path to list. Defaults to workspace root.'
            }
        },
        required: []
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const dirPath = args.path ? scopePath(args.path) : scopePath('.');

        if (!fs.existsSync(dirPath)) {
            return {
                content: [{ type: "text", text: `Directory not found: ${args.path || '.'}` }],
                isError: true
            };
        }

        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
            return {
                content: [{ type: "text", text: `Path is not a directory: ${args.path}` }],
                isError: true
            };
        }

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                const entryStat = fs.statSync(fullPath);
                return {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: entry.isFile() ? entryStat.size : undefined,
                    modified: entryStat.mtime.toISOString()
                };
            });

            return {
                content: [{ type: "text", text: JSON.stringify({ entries, total: entries.length }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to read directory: ${error.message}` }],
                isError: true
            };
        }
    }
}
