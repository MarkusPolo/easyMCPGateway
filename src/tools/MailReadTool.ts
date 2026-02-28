import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as dotenv from 'dotenv';

// Read from .env file
dotenv.config();

export class MailReadTool extends BaseTool {
    name = 'read_emails';
    description = 'Lists and reads emails from the mail worker service.';
    category = "Communication";

    inputSchema = {
        properties: {
            action: {
                type: 'string',
                enum: ['list', 'read_one'],
                description: 'The action to perform.'
            },
            id: {
                type: 'string',
                description: 'The unique email ID (required for read_one action).'
            },
            query: {
                type: 'string',
                description: 'Query string for listing emails (e.g., label:SENT for sent messages).'
            },
            pageToken: {
                type: 'string',
                description: 'Page token for pagination (offset for listing emails).'
            }
        },
        required: ['action']
    };

    private IN_URL = 'https://worker-in.mail.morgenstern.work/api';

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { action, id, query, pageToken } = args;

        try {
            const apiKey = process.env.MAIL_API_KEY;
            if (!apiKey) {
                throw new Error('Mail API key not configured. Register "MAIL_API_KEY" in .env.');
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            };

            switch (action) {
                case 'list': {
                    const isSentFolder = query?.includes('label:SENT');
                    const baseUrl = isSentFolder ? `${this.IN_URL}/emails/sent` : `${this.IN_URL}/emails`;
                    const params = new URLSearchParams();
                    params.append('limit', '50');
                    if (pageToken) params.append('offset', pageToken);
                    const fullUrl = `${baseUrl}?${params.toString()}`;
                    const res = await fetch(fullUrl, { headers });
                    if (!res.ok) throw new Error(`Mail API returned ${res.status}: ${res.statusText}`);
                    const data = await res.json();
                    return { content: [{ type: "text", text: JSON.stringify({ emails: data.messages, query }, null, 2) }] };
                }
                case 'read_one': {
                    if (!id) throw new Error('Email ID is required for read_one action');

                    const isSent = (query?.includes('label:SENT')) || false;
                    const endpoint = isSent ? `${this.IN_URL}/emails/sent/${id}` : `${this.IN_URL}/emails/${id}`;

                    // Fetch metadata
                    const resMeta = await fetch(endpoint, { headers });
                    if (!resMeta.ok) throw new Error(`Mail API returned ${resMeta.status}: ${resMeta.statusText}`);
                    const meta = await resMeta.json();

                    // Fetch body
                    const resBody = await fetch(`${endpoint}/body`, { headers });
                    let body = {};
                    if (resBody.ok) {
                        body = await resBody.json();
                    }

                    return { content: [{ type: "text", text: JSON.stringify({ ...meta, body }, null, 2) }] };
                }
                default:
                    throw new Error(`Unsupported action: ${action}`);
            }
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to read emails: ${error.message}` }],
                isError: true
            };
        }
    }
}
