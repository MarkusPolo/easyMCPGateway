import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { BrowserManager } from '../utils/BrowserManager';

export class BrowserTool extends BaseTool {
    name = 'browser';
    description = 'Interacts with websites using a real browser. Supports navigation, clicking elements by ID, typing, and more.';
    category = "Web Utilities";

    inputSchema = {
        properties: {
            action: {
                type: 'string',
                enum: ['navigate', 'click', 'type', 'scroll', 'hover', 'screenshot', 'get_state'],
                description: 'The action to perform.'
            },
            url: {
                type: 'string',
                description: 'The URL to navigate to (required for navigate).'
            },
            elementId: {
                type: 'number',
                description: 'The ID of the element to interact with (required for click, type, hover).'
            },
            text: {
                type: 'string',
                description: 'The text to type (required for type).'
            },
            direction: {
                type: 'string',
                enum: ['up', 'down'],
                description: 'Scroll direction (optional for scroll, defaults to down).'
            }
        },
        required: ['action']
    };

    async execute(args: Record<string, any>, profileId: string = 'default'): Promise<ToolResponse> {
        const { action, url, elementId, text, direction } = args;
        const browserManager = BrowserManager.getInstance();
        const page = await browserManager.getPage(profileId);

        try {
            switch (action) {
                case 'navigate':
                    if (!url) throw new Error('URL is required for navigate action');
                    await page.goto(url, { waitUntil: 'domcontentloaded' });
                    break;

                case 'click':
                    if (elementId === undefined) throw new Error('elementId is required for click action');
                    await page.click(`[data-mcp-id="${elementId}"]`);
                    break;

                case 'type':
                    if (elementId === undefined || text === undefined) throw new Error('elementId and text are required for type action');
                    await page.fill(`[data-mcp-id="${elementId}"]`, text);
                    break;

                case 'hover':
                    if (elementId === undefined) throw new Error('elementId is required for hover action');
                    await page.hover(`[data-mcp-id="${elementId}"]`);
                    break;

                case 'scroll':
                    const scrollAmount = direction === 'up' ? -500 : 500;
                    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
                    break;

                case 'screenshot':
                    const screenshot = await page.screenshot({ fullPage: false });
                    return {
                        content: [
                            { type: "text", text: "Screenshot captured." },
                            { type: "image", data: screenshot.toString('base64'), mimeType: "image/png" } as any
                        ]
                    };

                case 'get_state':
                    // Just returns the current state (default behavior below)
                    break;

                default:
                    throw new Error(`Unsupported action: ${action}`);
            }

            // After every action (except screenshot which returns early), return the new page state
            const state = await browserManager.getPageState(page);

            let output = `Current Page: ${state.title}\nURL: ${state.url}\n\n`;
            output += `--- INTERACTIVE ELEMENTS ---\n`;
            state.interactiveElements.forEach(el => {
                output += `[${el.id}] ${el.role}: "${el.name}"${el.description ? ` (${el.description})` : ''}\n`;
            });
            output += `\n--- PAGE CONTENT PREVIEW ---\n`;
            output += state.textTree;

            return {
                content: [{ type: "text", text: output }]
            };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Browser action failed: ${error.message}` }],
                isError: true
            };
        }
    }
}
