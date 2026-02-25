import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';

export class WebFetchTool extends BaseTool {
    name = 'web_fetch';
    description = 'Fetches a URL and converts the response to readable text/markdown.';
    category = "Web Utilities";

    inputSchema = {
        properties: {
            url: {
                type: 'string',
                description: 'The URL to fetch.'
            }
        },
        required: ['url']
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        const url: string = args.url;
        if (!url) {
            return {
                content: [{ type: "text", text: 'No URL provided' }],
                isError: true
            };
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AgentRunBusiness/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8'
                },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            const raw = await response.text();

            let content = raw;
            if (contentType.includes('text/html')) {
                content = this.htmlToText(raw);
            }

            // Cap content length
            if (content.length > 20000) {
                content = content.substring(0, 20000) + '\n\n[...truncated]';
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ content, url, content_type: contentType }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Web fetch failed: ${error.message}` }],
                isError: true
            };
        }
    }

    private htmlToText(html: string): string {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<h[1-6][^>]*>/gi, '## ')
            .replace(/<li[^>]*>/gi, '- ')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
}
