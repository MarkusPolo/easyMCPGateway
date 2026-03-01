import { AccountingArtifactTool } from './src/tools/AccountingArtifactTool';
import { HledgerAddTool } from './src/tools/HledgerAddTool';
import { HledgerReverseTool } from './src/tools/HledgerReverseTool';
import { HledgerLockTool } from './src/tools/HledgerLockTool';
import { HledgerReportTool } from './src/tools/HledgerReportTool';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    process.env.HLEDGER_PATH = 'C:\\Users\\Morgenstern\\AppData\\Local\\Microsoft\\WinGet\\Packages\\simonmichael.hledger_Microsoft.Winget.Source_8wekyb3d8bbwe\\hledger.exe';
    console.log("--- Starting Professional hledger Tools Verification ---");
    console.log("HLEDGER_PATH set to:", process.env.HLEDGER_PATH);

    // Ensure we use a clean test environment
    const journalPath = path.resolve(process.cwd(), 'data/test_pro_accounting.journal');
    process.env.HLEDGER_JOURNAL = journalPath;
    const settingsPath = path.resolve(process.cwd(), 'data/accounting/settings.json');
    const artifactsDir = path.resolve(process.cwd(), 'data/accounting/artifacts');

    if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
    if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    if (fs.existsSync(artifactsDir)) {
        fs.readdirSync(artifactsDir).forEach(file => fs.unlinkSync(path.join(artifactsDir, file)));
    }

    const artifactTool = new AccountingArtifactTool();
    const addTool = new HledgerAddTool();
    const reverseTool = new HledgerReverseTool();
    const lockTool = new HledgerLockTool();
    const reportTool = new HledgerReportTool();

    try {
        // 1. Save an artifact
        console.log("\n1. Testing AccountingArtifactTool...");
        const artRes = await artifactTool.execute({
            contentBase64: Buffer.from("Test Receipt Content").toString('base64'),
            fileName: "receipt.txt"
        });

        if (artRes.isError || !artRes.content[0].text) {
            throw new Error(`Artifact tool failed: ${artRes.content[0].text}`);
        }

        const artData = JSON.parse(artRes.content[0].text) as { artifactId: string };
        const artifactId = artData.artifactId;
        console.log("Artifact ID:", artifactId);

        // 2. Add transaction with artifact
        console.log("\n2. Testing HledgerAddTool with artifact and tags...");
        const addRes = await addTool.execute({
            description: "Office Supplies",
            postings: [
                { account: "expenses:supplies", amount: "25 EUR" },
                { account: "assets:cash" }
            ],
            tags: ["vendor:Staples"],
            artifactId: artifactId
        });
        console.log(addRes.content[0].text);

        // 3. Test Locking
        console.log("\n3. Testing HledgerLockTool...");
        await lockTool.execute({ lockDate: "2026-02-28" });

        console.log("Trying to add transaction in locked period (2026-02-15)...");
        const lockedRes = await addTool.execute({
            date: "2026-02-15",
            description: "Late Entry",
            postings: [{ account: "expenses:misc", amount: "10 EUR" }, { account: "assets:cash" }]
        });
        console.log("Lock Check Response:", lockedRes.content[0].text);

        // 4. Test Reversal
        console.log("\n4. Testing HledgerReverseTool (Storno)...");
        console.log("Current Journal Content:");
        console.log(fs.readFileSync(journalPath, 'utf-8'));

        const revRes = await reverseTool.execute({
            searchQuery: "tag:vendor=Staples",
            reason: "Wrong account"
        });
        console.log(revRes.content[0].text);

        // 5. Final Report
        console.log("\n5. Final Journal Print...");
        const printRes = await reportTool.execute({ command: "print" });
        console.log(printRes.content[0].text);

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("\nVerification failed:", err);
    }
}

test();
