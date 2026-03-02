import { BaseTool } from './BaseTool';
import { ToolResponse } from './types';
import { reviewService } from '../services/ReviewService';

export class ReviewListTool extends BaseTool {
    name = 'review_list';
    description = 'List reviews for one ticket or globally.';
    category = 'Communication';

    inputSchema = {
        properties: {
            ticket_id: { type: 'string' }
        }
    };

    async execute(args: Record<string, any>): Promise<ToolResponse> {
        try {
            const reviews = await reviewService.listReviews(args.ticket_id);
            return { content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: 'text', text: `Failed to list reviews: ${error.message}` }], isError: true };
        }
    }
}
