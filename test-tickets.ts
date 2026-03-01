import { TicketCreateTool } from "./src/tools/TicketCreateTool";
import { TicketClaimTool } from "./src/tools/TicketClaimTool";
import { TicketListTool } from "./src/tools/TicketListTool";
import { TicketUpdateTool } from "./src/tools/TicketUpdateTool";

async function runTests() {
    console.log("Starting Ticket System Tests...\n");

    const profileId1 = "agent-1-marketing";
    const profileId2 = "agent-2-ceo";

    const createTool = new TicketCreateTool();
    const claimTool = new TicketClaimTool();
    const listTool = new TicketListTool();
    const updateTool = new TicketUpdateTool();

    // 1. Create a Ticket
    console.log("--- 1. Creating Ticket ---");
    const createRes = await createTool.execute({
        title: "Setup Marketing Campaign",
        description: "Need a new campaign for Q3.",
        category: "marketing",
        target_role_hint: "marketing"
    }, profileId2);
    console.log(createRes.content[0].text);

    // Extract ID (hacky just for test)
    const match = createRes.content[0].text?.match(/ID: ([\w-]+)/);
    const ticketId = match ? match[1] : null;
    if (!ticketId) {
        console.error("Failed to extract ticket ID");
        return;
    }

    // 2. List Tickets
    console.log("\n--- 2. Listing Ready Tickets ---");
    const listRes = await listTool.execute({}, profileId1);
    console.log(listRes.content[0].text);

    // 3. Claim Ticket
    console.log("\n--- 3. Claiming Ticket ---");
    const claimRes = await claimTool.execute({ ticket_id: ticketId }, profileId1);
    console.log(claimRes.content[0].text);

    // 4. Update Ticket to In Progress
    console.log("\n--- 4. Updating Ticket Status ---");
    const updateRes = await updateTool.execute({ ticket_id: ticketId, status: "in_progress" }, profileId1);
    console.log(updateRes.content[0].text);

    // 5. Try Claiming Again (should fail)
    console.log("\n--- 5. Trying to claim already claimed ticket (should fail) ---");
    const claimRes2 = await claimTool.execute({ ticket_id: ticketId }, profileId2);
    console.log(claimRes2.content[0].text);

    // 6. Complete Ticket
    console.log("\n--- 6. Completing Ticket (waiting_review) ---");
    const finishRes = await updateTool.execute({ ticket_id: ticketId, status: "waiting_review", artifact_links: ["artifacts/123/campaign.md"] }, profileId1);
    console.log(finishRes.content[0].text);

    console.log("\nTests Complete.");
}

runTests().catch(console.error);
