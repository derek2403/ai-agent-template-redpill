import 'dotenv/config';
import { execute } from "./testSupport";  // Adjust the import path as per your project structure.

async function test() {
    const getResult = await execute({
        method: 'GET',
        path: '/ipfs/CID',  // Ensure the path is correct for your routing in index.ts
        queries: {
            chatQuery: ["I want to stake"],  // Query you want to test
            model: ["gpt-4o"],  // Model specification if required by your endpoint
        },
        secret: { apiKey: process.env.API_KEY },  // Using environment variable for the API key
        headers: {},
    });

    console.log('GET RESULT:', JSON.parse(getResult));
    console.log(`Now you are ready to publish your agent, add secrets, and interact with your agent in the following steps:\n- Execute: 'npm run publish-agent'\n- Set secrets: 'npm run set-secrets'\n- Go to the url produced by setting the secrets (e.g. https://wapo-testnet.phala.network/ipfs/QmPQJD5zv3cYDRM25uGAVjLvXGNyQf9Vonz7rqkQB52Jae?key=b092532592cbd0cf)`);
}

test()
    .catch(err => console.error('Error executing test:', err))
    .finally(() => process.exit());