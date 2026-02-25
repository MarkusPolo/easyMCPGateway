import * as fs from 'fs';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class ReadFileTool extends BaseTool {
    name = 'read_file';
    description = 'Reads the content of a file from the workspace.';
    category = "File System";

    inputSchema = {
        properties: {
            path: {
                type: 'string',
                description: 'The relative path of the file to read.'
            }
        },
        required: ['path']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const { path: requestedPath } = args as { path: string };

        try {
            const filePath = scopePath(requestedPath);

            if (!fs.existsSync(filePath)) {
                return {
                    content: [{ type: "text", text: `File not found: ${requestedPath}` }],
                    isError: true
                };
            }

            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                return {
                    content: [{ type: "text", text: `Path is a directory, not a file: ${requestedPath}` }],
                    isError: true
                };
            }

            const content = fs.readFileSync(filePath, 'utf-8');

            return {
                content: [{ type: "text", text: content }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to read file: ${error.message}` }],
                isError: true
            };
        }
    }
}
