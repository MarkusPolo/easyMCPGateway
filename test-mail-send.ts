import { MailSendTool } from './src/tools/MailSendTool';

async function testSend() {
    const tool = new MailSendTool();
    console.log("Testing MailSendTool.execute()...");

    try {
        const result = await tool.execute({
            to: 'marius.morg@gmail.com',
            subject: 'Test from easyMCPGateway',
            text: 'Hello! This is a test email sent from the new MailSendTool in easyMCPGateway.',
            html: '<h1>Hello!</h1><p>This is a test email sent from the <b>new MailSendTool</b> in easyMCPGateway.</p>'
        });

        if (result.isError) {
            console.error("❌ Mail Send Test Failed!");
            console.error("Error Detail:", result.content[0].text);
        } else {
            console.log("✅ Mail Send Test Successful!");
            console.log("Response:", result.content[0].text);
        }
    } catch (err: any) {
        console.error("❌ Unexpected Test Error:", err.message);
    }
}

testSend();
