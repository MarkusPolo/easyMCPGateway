import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as dotenv from 'dotenv';

// Read from .env file
dotenv.config();

export class MailSendTool extends BaseTool {
    name = 'send_email';
    description = 'Sends an email via the mail worker service. Requires MAIL_API_KEY in .env.';
    category = "Communication";

    inputSchema = {
        properties: {
            to: {
                type: 'string',
                description: 'The recipient email address.'
            },
            subject: {
                type: 'string',
                description: 'The email subject.'
            },
            text: {
                type: 'string',
                description: 'The plain text body of the email.'
            },
            html: {
                type: 'string',
                description: 'The HTML body of the email (optional).'
            }
        },
        required: ['to', 'subject']
    };

    private OUT_URL = 'https://worker.mail.morgenstern.work/api';

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const { to, subject, text, html } = args;

        if (!to || !subject) {
            return {
                content: [{ type: "text", text: 'Recipient and subject are required' }],
                isError: true
            };
        }

        if (!text && !html) {
            return {
                content: [{ type: "text", text: 'Either text or html body must be provided' }],
                isError: true
            };
        }

        try {
            const apiKey = process.env.MAIL_API_KEY;
            if (!apiKey) {
                throw new Error('Mail API key not configured. Register "MAIL_API_KEY" in .env.');
            }

            const url = `${this.OUT_URL}/send`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                },
                body: JSON.stringify({ to, subject, html, text })
            });

            if (!response.ok) {
                throw new Error(`Mail API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;

            return {
                content: [{ type: "text", text: JSON.stringify({ success: true, message: 'Email sent successfully', data }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Failed to send email: ${error.message}` }],
                isError: true
            };
        }
    }
}
