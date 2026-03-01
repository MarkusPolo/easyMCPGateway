import { AccountingArtifactTool } from './src/tools/AccountingArtifactTool';
import { HledgerAddTool } from './src/tools/HledgerAddTool';
import { HledgerReverseTool } from './src/tools/HledgerReverseTool';
import { HledgerReportTool } from './src/tools/HledgerReportTool';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    process.env.HLEDGER_PATH = 'C:\\Users\\Morgenstern\\AppData\\Local\\Microsoft\\WinGet\\Packages\\simonmichael.hledger_Microsoft.Winget.Source_8wekyb3d8bbwe\\hledger.exe';
    console.log("--- Starting Refined hledger Tools Audit/Idempotency Verification ---");

    const journalPath = path.resolve(process.cwd(), 'data/test_audit_accounting.journal');
    process.env.HLEDGER_JOURNAL = journalPath;
    const artifactsDir = path.resolve(process.cwd(), 'data/accounting/artifacts');

    // Clean up
    if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
    if (fs.existsSync(artifactsDir)) {
        fs.readdirSync(artifactsDir).forEach(file => fs.unlinkSync(path.join(artifactsDir, file)));
    }

    const artifactTool = new AccountingArtifactTool();
    const addTool = new HledgerAddTool();
    const reverseTool = new HledgerReverseTool();
    const reportTool = new HledgerReportTool();

    try {
        // 1. WORM Artifact Test
        console.log("\n1. Testing WORM Artifact Storage...");
        const content = Buffer.from("Sensitive Receipt Data").toString('base64');
        const res1 = await artifactTool.execute({ contentBase64: content, fileName: "receipt.pdf", mimeType: "application/pdf" });

        if (!res1.content || !res1.content[0] || !res1.content[0].text) throw new Error("Artifact upload 1 failed");
        const data1 = JSON.parse(res1.content[0].text) as { artifactId: string };
        console.log("First upload ID:", data1.artifactId);

        const res2 = await artifactTool.execute({ contentBase64: content, fileName: "duplicate.pdf" });
        if (!res2.content || !res2.content[0] || !res2.content[0].text) throw new Error("Artifact upload 2 failed");
        const data2 = JSON.parse(res2.content[0].text) as { artifactId: string };
        console.log("Second upload (same content) ID:", data2.artifactId);

        if (data1.artifactId === data2.artifactId) {
            console.log("SUCCESS: Content-addressable ID verified.");
        } else {
            console.error("FAIL: Content-addressable ID failed.");
        }

        // 2. Idempotency Test
        console.log("\n2. Testing Transaction Idempotency...");
        const extId = "INV-2024-001";
        const addRes1 = await addTool.execute({
            description: "Vendor Payment",
            postings: [{ account: "expenses:rent", amount: "1000 EUR" }, { account: "assets:bank" }],
            externalId: extId
        });

        if (!addRes1.content || !addRes1.content[0] || !addRes1.content[0].text) throw new Error("Add transaction 1 failed");
        console.log("First add result:", addRes1.content[0].text.substring(0, 100) + "...");

        const addRes2 = await addTool.execute({
            description: "Vendor Payment",
            postings: [{ account: "expenses:rent", amount: "1000 EUR" }, { account: "assets:bank" }],
            externalId: extId
        });

        if (!addRes2.content || !addRes2.content[0] || !addRes2.content[0].text) throw new Error("Add transaction 2 failed");
        console.log("Second add (idempotent) result:", addRes2.content[0].text.substring(0, 100) + "...");

        if (addRes2.content[0].text.includes("already exists")) {
            console.log("SUCCESS: Idempotency check verified.");
        } else {
            console.error("FAIL: Idempotency check failed.");
        }

        // 3. Audit Reversal Test
        console.log("\n3. Testing Audit-Ready Reversal...");
        // Extract internal ID from first transaction
        const firstTxContent = addRes1.content[0].text;
        const idMatch = firstTxContent.match(/id:([a-zA-Z0-9-]+)/);
        if (!idMatch) throw new Error("Could not find internal ID in add response");
        const internalId = idMatch[1];
        console.log("Found internal ID for reversal:", internalId);

        const revRes = await reverseTool.execute({
            origTxId: internalId,
            reason: "Incorrect amount"
        });

        if (!revRes.content || !revRes.content[0] || !revRes.content[0].text) throw new Error("Reversal failed");
        console.log("Reversal result:", revRes.content[0].text);

        if (revRes.content[0].text.includes(`rev_of:${internalId}`)) {
            console.log("SUCCESS: Audit reference (rev_of) verified.");
        } else {
            console.error("FAIL: Audit reference (rev_of) failed.");
        }

        // 4. Final Review
        console.log("\n4. Final Journal State:");
        const printRes = await reportTool.execute({ command: "print" });
        if (printRes.content && printRes.content[0] && printRes.content[0].text) {
            console.log(printRes.content[0].text);
        }

    } catch (err) {
        console.error("Verification failed:", err);
    }
}

test();
