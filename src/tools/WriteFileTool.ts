import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class WriteFileTool extends BaseTool {
    name = 'write_file';
    description = 'Writes content to a file in the workspace, creating parent directories if needed.';
    category = "File System";

    inputSchema = {
        properties: {
            path: {
                type: 'string',
                description: 'The relative path of the file to write to.'
            },
            content: {
                type: 'string',
                description: 'The content to write to the file.'
            }
        },
        required: ['path', 'content']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { path: requestedPath, content } = args as { path: string, content: string };

        try {
            const filePath = scopePath(requestedPath);
            const dir = path.dirname(filePath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, 'utf-8');

            return {
                content: [{ type: "text", text: `Successfully wrote ${Buffer.byteLength(content, 'utf-8')} bytes to ${requestedPath}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to write file: ${error.message}` }],
                isError: true
            };
        }
    }
}
