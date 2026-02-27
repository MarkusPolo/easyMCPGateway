import { memoryService } from "./src/utils/MemoryService";

async function testIsolation() {
    console.log("Starting Memory Isolation Test...");

    const profileA = "profile-a-id";
    const profileB = "profile-b-id";

    try {
        // 1. Store memory for Profile A
        console.log("Storing memory for Profile A...");
        await memoryService.store(profileA, "The secret password for Profile A is 'ALPHA'.", { secret: true });

        // 2. Store memory for Profile B
        console.log("Storing memory for Profile B...");
        await memoryService.store(profileB, "The favorite color of Profile B is 'Blue'.", { color: "blue" });

        // 3. Profile A tries to retrieve its own memory
        console.log("Profile A retrieving its own memory...");
        const resultsA = await memoryService.query(profileA, "What is the secret password?");
        console.log("Results for Profile A:", JSON.stringify(resultsA, null, 2));

        const foundA = resultsA.some(r => r.text.includes("ALPHA"));
        if (foundA) {
            console.log("✅ Profile A successfully retrieved its own memory.");
        } else {
            console.error("❌ Profile A failed to retrieve its own memory.");
        }

        // 4. Profile A tries to retrieve Profile B's memory
        console.log("Profile A trying to retrieve Profile B's memory (favorite color)...");
        const resultsAB = await memoryService.query(profileA, "What is the favorite color?");
        console.log("Results for Profile A searching for B's memory:", JSON.stringify(resultsAB, null, 2));

        const foundBInA = resultsAB.some(r => r.text.includes("Blue"));
        if (!foundBInA) {
            console.log("✅ Profile A could NOT retrieve Profile B's memory. Isolation works!");
        } else {
            console.error("❌ Profile A retrieved Profile B's memory! Isolation FAILED!");
        }

        // 5. Profile B tries to retrieve its own memory
        console.log("Profile B retrieving its own memory...");
        const resultsB = await memoryService.query(profileB, "What is the favorite color?");
        const foundB = resultsB.some(r => r.text.includes("Blue"));
        if (foundB) {
            console.log("✅ Profile B successfully retrieved its own memory.");
        } else {
            console.error("❌ Profile B failed to retrieve its own memory.");
        }

    } catch (error) {
        console.error("Test failed with error:", error);
    }
}

testIsolation();
