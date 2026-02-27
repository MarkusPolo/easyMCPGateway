import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class GrepTool extends BaseTool {
    name = 'grep';
    description = 'Searches for a text pattern or regex in the workspace files.';
    category = "File System";

    inputSchema = {
        properties: {
            pattern: {
                type: 'string',
                description: 'The text or RegExp pattern to search for.'
            },
            path: {
                type: 'string',
                description: 'The directory to search inside. Defaults to workspace root.'
            },
            regex: {
                type: 'boolean',
                description: 'Whether to treat the pattern as a Regular Expression.'
            }
        },
        required: ['pattern']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const pattern = args.pattern;
        const searchDir = args.path ? scopePath(args.path) : scopePath('.');
        const isRegex = args.regex === true;

        if (!fs.existsSync(searchDir)) {
            return {
                content: [{ type: "text", text: `Path not found: ${args.path || '.'}` }],
                isError: true
            };
        }

        const regex = isRegex ? new RegExp(pattern, 'gi') : null;
        const matches: Array<{ file: string; line: number; content: string }> = [];
        const maxResults = 50;

        const searchFiles = (dir: string) => {
            if (matches.length >= maxResults) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (matches.length >= maxResults) return;
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        searchFiles(fullPath);
                    }
                } else if (entry.isFile()) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
                            const found = regex ? regex.test(lines[i]) : lines[i].toLowerCase().includes(pattern.toLowerCase());
                            if (found) {
                                matches.push({
                                    file: path.relative(scopePath('.'), fullPath),
                                    line: i + 1,
                                    content: lines[i].trim()
                                });
                            }
                            if (regex) regex.lastIndex = 0;
                        }
                    } catch {
                        // Skip binary/unreadable files
                    }
                }
            }
        };

        try {
            searchFiles(searchDir);
            return {
                content: [{ type: "text", text: JSON.stringify({ matches, total: matches.length }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Search failed: ${error.message}` }],
                isError: true
            };
        }
    }
}
