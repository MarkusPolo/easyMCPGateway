import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { reviewService } from '../services/ReviewService';

export class ReviewSubmitTool extends BaseTool {
    name = 'review_submit';
    description = 'Submit review decision for a ticket (approved/changes_requested/rejected).';
    category = 'Communication';

    inputSchema = {
        properties: {
            ticket_id: { type: 'string' },
            reviewer_role: { type: 'string' },
            decision: { type: 'string', enum: ['approved', 'changes_requested', 'rejected'] },
            confidence: { type: 'number' },
            notes: { type: 'string' }
        },
        required: ['ticket_id', 'reviewer_role', 'decision', 'confidence', 'notes']
    };

    async execute(args: Record<string, any>, profileId?: string): Promise<ToolResponse> {
        if (!profileId) return { content: [{ type: 'text', text: 'profileId required' }], isError: true };
        try {
            const review = await reviewService.submitReview({
                ticket_id: args.ticket_id,
                reviewer_profile_id: profileId,
                reviewer_role: args.reviewer_role,
                decision: args.decision,
                confidence: args.confidence,
                notes: args.notes
            });
            return { content: [{ type: 'text', text: JSON.stringify(review, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to submit review: ${error.message}` }], isError: true };
        }
    }
}
