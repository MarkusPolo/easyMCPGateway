import * as fs from 'fs';
import * as path from 'path';
import { ticketService } from './TicketService';

interface OnboardingState {
    initializedAt?: string;
    completedAt?: string;
    onboardingTicketId?: string;
}

const ONBOARDING_SYSTEM_PROMPT = `You are an autonomous CEO agent responsible for building, operating, and optimizing a digital-first company under strict resource constraints.

Your primary objective is long-term company success, defined as sustainable revenue generation, strategic positioning, and operational efficiency.

You must operate using structured reasoning and disciplined decision-making.

Core operating principles:
- Always respect constraints, infrastructure limits, and jurisdiction.
- Prioritize high-leverage actions with asymmetric upside and low resource cost.
- Explicitly identify uncertainties, risks, and assumptions.
- Validate critical assumptions early using minimal resources.
- Prefer reversible decisions over irreversible ones when uncertainty is high.
- Continuously optimize for learning speed, capital efficiency, and strategic advantage.
- Avoid unnecessary complexity and operational overhead.
- Do not assume resources, capabilities, or permissions that are not explicitly available.

Execution model:
- First analyze, then decide, then act.
- Separate analysis, decision, and execution clearly.
- Maintain internal consistency across decisions.
- Optimize for long-term expected value, not short-term activity.

You are persistent, resource-aware, and outcome-driven.`;

const ONBOARDING_PROMPT = `You are the CEO of a newly founded company. Due to your extensive experience, you have been appointed to lead this company to success. The company is not yet planned and not yet operational. Your task is to plan and build this company from the ground up. While doing so, you must respect your constraints and capabilities. You are able to make operational decisions, orchestrate your workers, and act operationally yourself.

## Constraints

- **Budget:** Initially no budget. A small budget (up to €100) may be obtained by proving capability.
- **Recurring costs:** None so far.
- **Infrastructure:** You run on a Raspberry Pi 5 with 4 GB RAM.
- **Timeframe:** Meaningful results are expected within 3 months.
- **Jurisdiction:** A German sole proprietorship operated as a side business (under the president, Marius) is available to you. You must therefore comply with both German and European law. Sales/services may only take place within the EU, as anything beyond that would make the tax requirements too complex.
- **Workforce constraints:** Your workers are purely digital. Therefore, little to no physical work should be performed.

## 1. Self-Assessment

a. What tools are available to me?
b. What opportunities do I have?
c. What limitations do I have?
d. What am I good at?
e. What am I not good at?
f. What is my role?
g. Which assumptions may be wrong?
h. Which uncertainties exist?
j. What must be validated early?

## 2. Market Analysis

a. Research the current market.
b. Where are the opportunities?
c. Where are the niches?
d. What is currently relevant?
e. What are the current trends?

## 3. Competitor Analysis

a. Who are the most important competitors?
b. Why are they winning?
c. Where are their weaknesses?
d. Where do I have a structural advantage?

## 4. Business Model Design

a. Who are my customers?
b. What is the product?
c. How is revenue generated?
d. What is the pricing strategy?
e. What is the distribution strategy?

## 5. Write the Core Files

- **Principles** -> Business principles for the workers
- **Goals** -> KPIs that define success
- **Strategy** -> How the goals should be achieved
- **Mission** -> Why the company exists (purpose, reason for existence)`;

export class OnboardingService {
    private statePath: string;

    constructor() {
        this.statePath = path.resolve(process.cwd(), 'onboarding-state.json');
    }

    private readState(): OnboardingState {
        if (!fs.existsSync(this.statePath)) return {};
        return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as OnboardingState;
    }

    private writeState(state: OnboardingState) {
        fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
    }

    private ensureCoreDocsPlaceholders() {
        const docs: Array<{ file: string; title: string }> = [
            { file: 'principles.md', title: 'Principles' },
            { file: 'goals.md', title: 'Goals' },
            { file: 'strategy.md', title: 'Strategy' },
            { file: 'mission.md', title: 'Mission' }
        ];

        for (const doc of docs) {
            const abs = path.resolve(process.cwd(), doc.file);
            if (!fs.existsSync(abs)) {
                fs.writeFileSync(abs, `# ${doc.title}\n\n<!-- Created by onboarding bootstrap. Fill this during CEO onboarding. -->\n`, 'utf-8');
            }
        }
    }

    public async ensureOnboardingInitialized() {
        const state = this.readState();
        this.ensureCoreDocsPlaceholders();

        if (state.completedAt) {
            return { status: 'completed', state };
        }

        if (state.onboardingTicketId) {
            const existing = await ticketService.getTicket(state.onboardingTicketId);
            if (existing) {
                return { status: 'pending', state };
            }
        }

        const ticket = await ticketService.createTicket({
            title: 'CEO Onboarding: Foundational Company Setup',
            description: [
                'Run the full CEO onboarding flow and produce first company baseline docs.',
                '',
                '## System Prompt',
                ONBOARDING_SYSTEM_PROMPT,
                '',
                '## Prompt',
                ONBOARDING_PROMPT,
                '',
                '## Required Artifacts',
                '- principles.md',
                '- goals.md',
                '- strategy.md',
                '- mission.md'
            ].join('\n'),
            category: 'ops',
            priority: 10,
            target_role_hint: 'CEO',
            planningMode: true,
            requested_by: 'system-bootstrap',
            acceptance_criteria: [
                'Self-assessment completed',
                'Market analysis completed',
                'Competitor analysis completed',
                'Business model design completed',
                'Core files written: principles.md, goals.md, strategy.md, mission.md'
            ]
        });

        const next: OnboardingState = {
            initializedAt: new Date().toISOString(),
            onboardingTicketId: ticket.id
        };
        this.writeState(next);
        return { status: 'created', state: next };
    }

    public getStatus() {
        const state = this.readState();
        if (state.completedAt) return { status: 'completed', state };
        if (state.onboardingTicketId) return { status: 'pending', state };
        return { status: 'not_initialized', state };
    }

    public markCompleted() {
        const state = this.readState();
        const next: OnboardingState = {
            ...state,
            completedAt: new Date().toISOString()
        };
        this.writeState(next);
        return next;
    }
}

export const onboardingService = new OnboardingService();
