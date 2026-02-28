import { MailReadTool } from './src/tools/MailReadTool';

async function testMail() {
    const tool = new MailReadTool();
    console.log("Testing MailReadTool.list() to verify API Key...");

    try {
        const result = await tool.execute({
            action: 'list'
        });

        if (result.isError) {
            console.error("❌ Mail API Test Failed!");
            console.error("Error Detail:", result.content[0].text);
        } else {
            console.log("✅ Mail API Test Successful!");
            const data = JSON.parse(result.content[0].text || '{}');
            console.log(`Found ${data.emails?.length || 0} emails.`);
            if (data.emails?.length > 0) {
                console.log("Sample ID:", data.emails[0].id);
            }
        }
    } catch (err: any) {
        console.error("❌ Unexpected Test Error:", err.message);
    }
}

testMail();
