import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface PageState {
    url: string;
    title: string;
    interactiveElements: {
        id: number;
        role: string;
        name: string;
        description?: string;
    }[];
    textTree: string;
    screenshot?: string; // Base64
}

export class BrowserManager {
    private static instance: BrowserManager;
    private browser: Browser | null = null;
    private contexts: Map<string, BrowserContext> = new Map();

    private constructor() { }

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    private async ensureBrowser() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true
            });
        }
        return this.browser;
    }

    public async getContext(profileId: string): Promise<BrowserContext> {
        let context = this.contexts.get(profileId);
        if (!context) {
            const browser = await this.ensureBrowser();
            context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            });
            this.contexts.set(profileId, context);
        }
        return context;
    }

    public async getPage(profileId: string): Promise<Page> {
        const context = await this.getContext(profileId);
        const pages = context.pages();
        if (pages.length > 0) {
            return pages[0];
        }
        return await context.newPage();
    }

    public async closeContext(profileId: string) {
        const context = this.contexts.get(profileId);
        if (context) {
            await context.close();
            this.contexts.delete(profileId);
        }
    }

    public async getPageState(page: Page): Promise<PageState> {
        const url = page.url();
        const title = await page.title();

        // Script to extract interactive elements and simplify DOM
        const state = await page.evaluate(() => {
            const interactiveSelectors = [
                'button', 'a[href]', 'input', 'select', 'textarea',
                '[role="button"]', '[role="link"]', '[role="checkbox"]',
                '[role="menuitem"]', '[role="tab"]'
            ];

            const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(',')))
                .filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
                });

            const interactiveElements = elements.map((el, index) => {
                const id = index + 1;
                el.setAttribute('data-mcp-id', id.toString());

                return {
                    id,
                    role: el.tagName.toLowerCase() === 'a' ? 'link' : (el.getAttribute('role') || el.tagName.toLowerCase()),
                    name: el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('value') || 'Unnamed',
                    description: el.getAttribute('title') || undefined
                };
            });

            // Very simple text tree representation
            // In a real scenario, this would be more sophisticated (Accessibility Tree based)
            let textTree = document.body.innerText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .slice(0, 100) // Limit tokens
                .join('\n');

            return { interactiveElements, textTree };
        });

        return {
            url,
            title,
            ...state
        };
    }

    public async cleanup() {
        for (const context of this.contexts.values()) {
            await context.close();
        }
        this.contexts.clear();
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
