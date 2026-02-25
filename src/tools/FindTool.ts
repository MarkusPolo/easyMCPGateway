import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class FindTool extends BaseTool {
    name = 'find';
    description = 'Finds files across the workspace matching a glob pattern.';
    category = "File System";

    inputSchema = {
        properties: {
            path: {
                type: 'string',
                description: 'The directory to search inside. Defaults to root workspace.'
            },
            pattern: {
                type: 'string',
                description: 'The glob pattern to match file or directory names against (e.g., *.ts).'
            }
        },
        required: []
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const searchDir = args.path ? scopePath(args.path) : scopePath('.');
        const pattern = args.pattern || '*';
        const maxResults = 50;

        if (!fs.existsSync(searchDir)) {
            return {
                content: [{ type: "text", text: `Path not found: ${args.path || '.'}` }],
                isError: true
            };
        }

        const results: string[] = [];
        const globToRegex = (glob: string): RegExp => {
            const escaped = glob
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(`^${escaped}$`, 'i');
        };

        const regex = globToRegex(pattern);

        const walk = (dir: string) => {
            if (results.length >= maxResults) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (results.length >= maxResults) return;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        if (regex.test(entry.name)) {
                            results.push(path.relative(scopePath('.'), fullPath));
                        }
                        walk(fullPath);
                    }
                } else {
                    if (regex.test(entry.name)) {
                        results.push(path.relative(scopePath('.'), fullPath));
                    }
                }
            }
        };

        try {
            walk(searchDir);
            return {
                content: [{ type: "text", text: JSON.stringify({ files: results, total: results.length }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Search failed: ${error.message}` }],
                isError: true
            };
        }
    }
}
