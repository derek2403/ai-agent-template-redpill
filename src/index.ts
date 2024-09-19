import { Request, Response, route } from './httpSupport';
import { getCurrentPrices } from './curprice';

async function GET(req: Request): Promise<Response> {
    const secrets = req.secret || {};
    const queries = req.queries;
    const apiKey = secrets.apiKey || 'sk-qVBlJkO3e99t81623PsB0zHookSQJxU360gDMooLenN01gv2';
    const model = queries.model ? queries.model[0] : 'gpt-4o';
    const chatQuery = queries.chatQuery ? queries.chatQuery[0] : 'What is the best chain to stake ETH?';
    let result = {
        message: '',
    };

    try {
        if (chatQuery.toLowerCase().includes("stake")) {
            console.log('Staking query detected');
            const ethUsdHistory = await getHistoricalPrices();
            console.log('Historical ETH/USD data:', ethUsdHistory);
            const currentPrices = await getCurrentPrices();
            console.log('Current Prices:', currentPrices);

            const validPrices = Object.fromEntries(
                Object.entries(currentPrices).filter(([_, price]) => price !== null)
            ) as { [key: string]: number };
            console.log('Valid Prices:', validPrices);

            if (Object.keys(validPrices).length === 0) {
                result.message = "Unable to fetch current prices. Please try again later.";
            } else {
                const predictions = await performPredictions(ethUsdHistory, validPrices);
                console.log('Predictions:', predictions);
                const bestChain = getBestChain(predictions, validPrices);
                console.log('Best Chain:', bestChain);

                result.message = `The best chain to stake based on predictions is: ${bestChain}.`;
            }
        } else if (chatQuery.toLowerCase().includes("create account")) {
            const chain = identifyChain(chatQuery);
            await createAccount(chain);
            result.message = `Account creation initiated for ${chain}.`;
        } else if (chatQuery.toLowerCase().includes("transfer")) {
            const [_, chain, address] = identifyTransferDetails(chatQuery);
            await transfer(chain, address);
            result.message = `Transfer initiated to ${address} on ${chain}.`;
        } else if (chatQuery.toLowerCase().includes("list wallets")) {
            const wallets = await listWallets();
            result.message = `Available wallets: ${wallets.join(", ")}`;
        } else {
            const response = await fetch('https://api.red-pill.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: `${chatQuery}` }],
                    model: `${model}`,
                }),
            });
            const responseData = await response.json();
            result.message = responseData.error ? responseData.error : responseData.choices[0].message.content;
        }
    } catch (error) {
        console.error('Error:', error);
        result.message = (error as Error).message;
    }

    return new Response(JSON.stringify(result));
}

async function getHistoricalPrices(): Promise<{ datetime: string; price: number }[]> {
    const baseURL = 'https://benchmarks.pyth.network/v1/updates/price';
    const ethUsdPriceFeedId = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

    const getDateRange = () => {
        const endDate = new Date();
        endDate.setMinutes(endDate.getMinutes() - 1);
        endDate.setSeconds(0, 0);
        const startDate = new Date(endDate.getTime() - 29 * 60 * 1000);
        const dateArray = [];
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            dateArray.push(new Date(currentDate));
            currentDate.setMinutes(currentDate.getMinutes() + 1);
        }
        return dateArray.reverse();
    };

    const formatTimestamp = (unixTimestamp: number) => {
        const date = new Date(unixTimestamp * 1000);
        return date.toISOString().replace('T', ' ').substring(0, 19);
    };

    async function fetchHistoricalPrice(date: Date) {
        const timestamp = Math.floor(date.getTime() / 1000);
        const url = `${baseURL}/${timestamp}/60?ids=${ethUsdPriceFeedId}&parsed=true&unique=true`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            return data.map((entry: any) => {
                const priceData = entry.parsed[0]?.price;
                if (priceData) {
                    const price = parseFloat(priceData.price) / Math.pow(10, Math.abs(priceData.expo));
                    const publishTime = formatTimestamp(priceData.publish_time);
                    return { datetime: publishTime, price };
                }
                return null;
            }).filter((entry: any) => entry !== null);
        } catch (err) {
            console.error(`Error fetching price for ${formatTimestamp(timestamp)}:`, err);
            return null;
        }
    }

    const dateRange = getDateRange();
    const pricePromises = dateRange.map(date => fetchHistoricalPrice(date));
    const priceData = await Promise.all(pricePromises);

    return priceData.flat().filter(price => price !== null);
}

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

function dsigmoid(x: number): number {
    return x * (1 - x);
}

function tanh(x: number): number {
    return Math.tanh(x);
}

function dtanh(x: number): number {
    return 1 - x * x;
}

class LSTMCell {
    private wf: number[][];
    private wi: number[][];
    private wc: number[][];
    private wo: number[][];
    private bf: number[];
    private bi: number[];
    private bc: number[];
    private bo: number[];

    constructor(inputSize: number, hiddenSize: number) {
        this.wf = this.initializeWeight(hiddenSize, inputSize + hiddenSize);
        this.wi = this.initializeWeight(hiddenSize, inputSize + hiddenSize);
        this.wc = this.initializeWeight(hiddenSize, inputSize + hiddenSize);
        this.wo = this.initializeWeight(hiddenSize, inputSize + hiddenSize);
        this.bf = new Array(hiddenSize).fill(0);
        this.bi = new Array(hiddenSize).fill(0);
        this.bc = new Array(hiddenSize).fill(0);
        this.bo = new Array(hiddenSize).fill(0);
    }

    private initializeWeight(rows: number, cols: number): number[][] {
        return Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => Math.random() - 0.5)
        );
    }

    forward(x: number[], h: number[], c: number[]): [number[], number[]] {
        const concat = [...x, ...h];
        const f = this.wf.map((row, i) =>
            sigmoid(row.reduce((sum, w, j) => sum + w * concat[j], 0) + this.bf[i])
        );
        const i = this.wi.map((row, i) =>
            sigmoid(row.reduce((sum, w, j) => sum + w * concat[j], 0) + this.bi[i])
        );
        const cNew = this.wc.map((row, i) =>
            tanh(row.reduce((sum, w, j) => sum + w * concat[j], 0) + this.bc[i])
        );
        const o = this.wo.map((row, i) =>
            sigmoid(row.reduce((sum, w, j) => sum + w * concat[j], 0) + this.bo[i])
        );

        const newC = c.map((cVal, idx) => cVal * f[idx] + i[idx] * cNew[idx]);
        const newH = newC.map((cVal, idx) => o[idx] * tanh(cVal));

        return [newH, newC];
    }
}

async function performLSTMPrediction(history: { datetime: string; price: number }[]): Promise<number> {
    const prices = history.map(entry => entry.price);
    const scaledPrices = minMaxScaling(prices);

    const inputSize = 1;
    const hiddenSize = 4;
    const sequenceLength = 10;
    const learningRate = 0.01;
    const epochs = 100;

    const lstm = new LSTMCell(inputSize, hiddenSize);

    for (let epoch = 0; epoch < epochs; epoch++) {
        let totalLoss = 0;

        for (let i = sequenceLength; i < scaledPrices.length; i++) {
            const sequence = scaledPrices.slice(i - sequenceLength, i);
            const target = scaledPrices[i];

            let h = new Array(hiddenSize).fill(0);
            let c = new Array(hiddenSize).fill(0);

            for (const input of sequence) {
                [h, c] = lstm.forward([input], h, c);
            }

            const prediction = h[0];
            const loss = (prediction - target) ** 2;
            totalLoss += loss;

            const gradient = 2 * (prediction - target);
            h = h.map(val => val - learningRate * gradient);
        }

        if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}, Loss: ${totalLoss / (scaledPrices.length - sequenceLength)}`);
        }
    }

    const lastSequence = scaledPrices.slice(-sequenceLength);
    let h = new Array(hiddenSize).fill(0);
    let c = new Array(hiddenSize).fill(0);

    for (const input of lastSequence) {
        [h, c] = lstm.forward([input], h, c);
    }

    const predictedScaledPrice = h[0];
    const predictedPrice = inverseMinMaxScaling(predictedScaledPrice, prices);

    return predictedPrice;
}

function minMaxScaling(data: number[]): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    return data.map(value => (value - min) / (max - min));
}

function inverseMinMaxScaling(scaledValue: number, originalData: number[]): number {
    const min = Math.min(...originalData);
    const max = Math.max(...originalData);
    return scaledValue * (max - min) + min;
}

async function performPredictions(history: { datetime: string; price: number }[], currentPrices: { [key: string]: number }): Promise<{ [key: string]: number }> {
    console.log('Starting predictions');
    const predictions: { [key: string]: number } = {};
    for (const chain of Object.keys(currentPrices)) {
        console.log(`Predicting for ${chain}`);
        const scaledHistory = history.map(entry => ({
            datetime: entry.datetime,
            price: entry.price * (currentPrices[chain] / currentPrices['ETH'])
        }));
        console.log(`Scaled history for ${chain}:`, scaledHistory);
        predictions[chain] = await performLSTMPrediction(scaledHistory);
        console.log(`Prediction for ${chain}: ${predictions[chain]}`);
    }
    console.log('All predictions:', predictions);
    return predictions;
}

function getBestChain(predictions: { [key: string]: number }, currentPrices: { [key: string]: number }): string {
    console.log('Getting best chain');
    console.log('Predictions:', predictions);
    console.log('Current Prices:', currentPrices);
    let bestChain = '';
    let maxDifference = -Infinity;
    for (const chain of Object.keys(predictions)) {
        const difference = predictions[chain] - currentPrices[chain];
        console.log(`${chain} difference: ${difference}`);
        if (difference > maxDifference) {
            maxDifference = difference;
            bestChain = chain;
        }
    }
    console.log(`Best chain: ${bestChain}, Max difference: ${maxDifference}`);
    return bestChain || 'Unable to determine best chain';
}

function identifyChain(query: string): string {
    if (query.toLowerCase().includes('ethereum')) return 'Ethereum';
    if (query.toLowerCase().includes('optimism')) return 'Optimism';
    if (query.toLowerCase().includes('polygon')) return 'Polygon';
    return 'Unknown';
}

function identifyTransferDetails(query: string): [string, string, string] {
    const parts = query.split(' ');
    const toIndex = parts.indexOf('to');
    const onIndex = parts.indexOf('on');
    const address = parts[toIndex + 1];
    const chain = parts[onIndex + 1];
    return ['Transfer', chain, address];
}

async function createAccount(chain: string): Promise<void> {
    console.log(`Creating account on ${chain}. Implementation pending.`);
}

async function transfer(chain: string, address: string): Promise<void> {
    console.log(`Initiating transfer to ${address} on ${chain}. Implementation pending.`);
}

async function listWallets(): Promise<string[]> {
    console.log('Listing wallets. Implementation pending.');
    return ['Wallet1', 'Wallet2'];
}

export default async function main(request: string) {
    return await route({ GET }, request);
}