import * as fs from 'fs';
import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { scopePath } from '../utils/pathUtils';

export class EditFileTool extends BaseTool {
    name = 'edit_file';
    description = 'Edits a file by replacing specific target strings with replacement strings. Supports multiple edits.';
    category = "File System";

    inputSchema = {
        properties: {
            path: {
                type: 'string',
                description: 'The relative path of the file to edit.'
            },
            edits: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        target: { type: 'string', description: 'The exact string to be replaced.' },
                        replacement: { type: 'string', description: 'The string to replace the target with.' }
                    },
                    required: ['target', 'replacement']
                },
                description: 'A list of edits to apply.'
            },
            target: {
                type: 'string',
                description: 'Single edit target string (fallback if edits array is not provided).'
            },
            replacement: {
                type: 'string',
                description: 'Single edit replacement string (fallback if edits array is not provided).'
            }
        },
        required: ['path']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const { path: requestedPath, edits: editsArray, target, replacement } = args;

        try {
            const filePath = scopePath(requestedPath);

            if (!fs.existsSync(filePath)) {
                return {
                    content: [{ type: "text", text: `File not found: ${requestedPath}` }],
                    isError: true
                };
            }

            const content = fs.readFileSync(filePath, 'utf-8');

            const edits: Array<{ target: string; replacement: string }> =
                Array.isArray(editsArray) && editsArray.length > 0
                    ? editsArray
                    : (target && replacement !== undefined ? [{ target, replacement }] : []);

            if (edits.length === 0) {
                return {
                    content: [{ type: "text", text: `No edits provided (either 'edits' array or 'target'/'replacement' required).` }],
                    isError: true
                };
            }

            let currentContent = content;
            let editsApplied = 0;

            for (const edit of edits) {
                if (!currentContent.includes(edit.target)) {
                    return {
                        content: [{ type: "text", text: `Target string not found in file: "${edit.target.substring(0, 50)}..."` }],
                        isError: true
                    };
                }
                currentContent = currentContent.replace(edit.target, edit.replacement);
                editsApplied++;
            }

            fs.writeFileSync(filePath, currentContent, 'utf-8');

            return {
                content: [{ type: "text", text: `Successfully applied ${editsApplied} edit(s) to ${requestedPath}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to edit file: ${error.message}` }],
                isError: true
            };
        }
    }
}
