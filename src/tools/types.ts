export interface ToolDefinition {
    name: string;
    description: string;
    category?: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface ToolResponse {
    content: Array<{
        type: "text" | "image" | "resource";
        text?: string;
        data?: string;
        mimeType?: string;
        resource?: { uri: string; mimeType?: string; text?: string; blob?: string };
    }>;
    isError?: boolean;
}

export interface ITool {
    category: string;
    definition(): ToolDefinition;
    execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse>;
}

export type TicketStatus = 'new' | 'ready' | 'claimed' | 'in_progress' | 'waiting_review' | 'blocked' | 'done' | 'canceled';
export type TicketCategory = 'marketing' | 'finance' | 'code' | 'legal' | 'sales' | 'ops';

export interface Ticket {
    id: string;
    title: string;
    description: string;
    status: TicketStatus;
    category: TicketCategory;
    priority: number;
    target_role_hint?: string;
    planningMode: boolean;
    deadline?: string;
    requested_by: string;
    claimed_by?: string;
    claimed_at?: string;
    lease_until?: string;
    heartbeat_at?: string;
    attempts: number;
    next_retry_at?: string;
    run_id?: string;
    created_at: string;
    updated_at: string;
    acceptance_criteria: string[];
    dependencies: string[];
    artifact_links: string[];
    reason?: string;
}
