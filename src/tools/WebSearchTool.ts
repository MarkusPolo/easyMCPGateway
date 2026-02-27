import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import * as dotenv from 'dotenv';

// Read from .env file
dotenv.config();

export class WebSearchTool extends BaseTool {
    name = 'web_search';
    description = 'Web search via Brave Search API. Requires BRAVE_SEARCH_API_KEY in .env.';
    category = "Web Utilities";

    inputSchema = {
        properties: {
            query: {
                type: 'string',
                description: 'The search query.'
            },
            count: {
                type: 'number',
                description: 'Number of results to return (default 5).'
            }
        },
        required: ['query']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        const query: string = args.query;
        if (!query) {
            return {
                content: [{ type: "text", text: 'No search query provided' }],
                isError: true
            };
        }

        const count = args.count || 5;

        try {
            const apiKey = process.env.BRAVE_SEARCH_API_KEY;
            if (!apiKey) {
                throw new Error('Brave Search API key not configured. Register secret "BRAVE_SEARCH_API_KEY" in .env.');
            }

            const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`Brave Search API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;
            const results = (data.web?.results || []).map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.description
            }));

            return {
                content: [{ type: "text", text: JSON.stringify({ results, total: results.length, query }, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Web search failed: ${error.message}` }],
                isError: true
            };
        }
    }
}
