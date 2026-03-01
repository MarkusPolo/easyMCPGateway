import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class AccountingArtifactTool extends BaseTool {
    name = "accounting_save_artifact";
    description = "Saves an accounting artifact (receipt, invoice PDF) and returns a document ID.";
    category = "Accounting";

    inputSchema = {
        properties: {
            contentBase64: {
                type: "string",
                description: "The base64 encoded content of the file."
            },
            fileName: {
                type: "string",
                description: "Original filename (e.g., invoice_123.pdf)."
            },
            mimeType: {
                type: "string",
                description: "Optional MIME type (e.g., application/pdf)."
            }
        },
        required: ["contentBase64", "fileName"]
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const content = Buffer.from(args.contentBase64, 'base64');
        const fileName = args.fileName;

        // Generate a unique ID based on content hash
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        const artifactId = hash.substring(0, 16);

        const ext = path.extname(fileName);
        const storagePath = path.resolve(process.cwd(), 'data/accounting/artifacts', `${artifactId}${ext}`);

        // Ensure directory exists
        const dir = path.dirname(storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        try {
            fs.writeFileSync(storagePath, content);

            // Also save metadata
            const metadataPath = storagePath + '.json';
            const metadata = {
                id: artifactId,
                originalName: fileName,
                mimeType: args.mimeType || 'application/octet-stream',
                hash,
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        artifactId,
                        storagePath: path.relative(process.cwd(), storagePath),
                        message: `Artifact saved successfully with ID: ${artifactId}`
                    }, null, 2)
                }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to save artifact: ${error.message}` }],
                isError: true
            };
        }
    }
}
