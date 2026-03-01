import { HledgerAddTool } from './src/tools/HledgerAddTool';
import { HledgerReportTool } from './src/tools/HledgerReportTool';
import { HledgerCheckTool } from './src/tools/HledgerCheckTool';
import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
    process.env.HLEDGER_PATH = 'C:\\Users\\Morgenstern\\AppData\\Local\\Microsoft\\WinGet\\Packages\\simonmichael.hledger_Microsoft.Winget.Source_8wekyb3d8bbwe\\hledger.exe';
    process.env.HLEDGER_JOURNAL = 'data/test_accounting.journal';

    console.log("--- Starting hledger Tools Verification ---");
    console.log("HLEDGER_PATH:", process.env.HLEDGER_PATH);
    console.log("HLEDGER_JOURNAL:", process.env.HLEDGER_JOURNAL);

    const addTool = new HledgerAddTool();
    const reportTool = new HledgerReportTool();
    const checkTool = new HledgerCheckTool();

    const journalPath = 'data/test_accounting.journal';
    process.env.HLEDGER_JOURNAL = journalPath;

    // Cleanup old test journal
    if (fs.existsSync(journalPath)) {
        fs.unlinkSync(journalPath);
    }

    try {
        // 1. Add a transaction
        console.log("\n1. Testing HledgerAddTool...");
        const addRes = await addTool.execute({
            description: "Test Invoice",
            postings: [
                { account: "assets:bank", amount: "100 EUR" },
                { account: "income:sales" }
            ]
        });
        console.log(addRes.content[0].text);

        // 2. Run a balance report
        console.log("\n2. Testing HledgerReportTool (bal)...");
        const balRes = await reportTool.execute({
            command: "bal"
        });
        console.log(balRes.content[0].text);

        // 3. Run an integrity check
        console.log("\n3. Testing HledgerCheckTool...");
        const checkRes = await checkTool.execute({});
        console.log(checkRes.content[0].text);

        console.log("\n--- Verification Complete ---");
    } catch (err) {
        console.error("\nVerification failed:", err);
    }
}

test();
