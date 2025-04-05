import { placeTrade } from './gmx/index.js';

/**
 * Initialize the trading tool for executing trades on GMX
 */
export async function initializeTradingTool() {
    // Add any initialization logic or environment variable checks here
    if (!process.env.ALCHEMY_API_KEY) {
        console.warn("Warning: ALCHEMY_API_KEY environment variable not set");
    }

    // Define examples of how to use this tool
    const examples = [
        {
            userQuery: "I want to place a 2x long position on BTC with 0.001 ETH",
            toolInput: JSON.stringify({
                native: "ETH",
                asset: "BTC",
                chain: "421614",
                leverage: 2,
                positionSizeInNative: 0.001,
                isLong: true
            }),
            toolOutput: JSON.stringify({
                success: true,
                txHash: "0xbe2f5ffd4f00778234ed3d4836c6bf0c473a9c86a5ca823a40278aa73d59a0e1",
                explorerUrl: "https://sepolia.arbiscan.io/tx/0xbe2f5ffd4f00778234ed3d4836c6bf0c473a9c86a5ca823a40278aa73d59a0e1",
                position: {
                    asset: "BTC",
                    leverage: "2x",
                    direction: "LONG",
                }
            }),
            outputResponse: "Successfully placed a 2x long position on BTC with 0.001 ETH. View tx in the explorer https://sepolia.arbiscan.io/tx/0xbe2f5ffd4f00778234ed3d4836c6bf0c473a9c86a5ca823a40278aa73d59a0e1"
        },
        {
            userQuery: "Place a 3x short position on ETH with 0.005 ETH",
            toolInput: JSON.stringify({
                native: "ETH",
                asset: "ETH",
                chain: "421614",
                leverage: 3,
                positionSizeInNative: 0.005,
                isLong: false
            }),
            toolOutput: JSON.stringify({
                success: true,
                txHash: "0x2a95d1c115ca97b57f0d9abdb4870f1475b7ad9cfa706068f5dc27a6449f8f98",
                explorerUrl: "https://sepolia.arbiscan.io/tx/0x2a95d1c115ca97b57f0d9abdb4870f1475b7ad9cfa706068f5dc27a6449f8f98",
                position: {
                    asset: "ETH",
                    leverage: "3x",
                    direction: "SHORT",
                }
            }),
            outputResponse: "Successfully placed a 3x short position on ETH with 0.005 ETH. View tx in the explorer https://sepolia.arbiscan.io/tx/0x2a95d1c115ca97b57f0d9abdb4870f1475b7ad9cfa706068f5dc27a6449f8f98"
        },
        {
            userQuery: "Open a 5x long position on AVAX with 0.01 ETH",
            toolInput: JSON.stringify({
                native: "ETH",
                asset: "AVAX",
                chain: "421614",
                leverage: 5,
                positionSizeInNative: 0.01,
                isLong: true
            }),
            toolOutput: JSON.stringify({
                success: true,
                txHash: "0x80cf5456b0a7b37b1d9bf5340a01bae816643cb74e551cfe65f6746fa9a699f6",
                explorerUrl: "https://sepolia.arbiscan.io/tx/0x80cf5456b0a7b37b1d9bf5340a01bae816643cb74e551cfe65f6746fa9a699f6",
                position: {
                    asset: "AVAX",
                    leverage: "5x",
                    direction: "LONG",
                }
            }),
            outputResponse: "Successfully placed a 5x long position on AVAX with 0.01 ETH. View tx in the explorer https://sepolia.arbiscan.io/tx/0x80cf5456b0a7b37b1d9bf5340a01bae816643cb74e551cfe65f6746fa9a699f6"
        },
        {
            userQuery: "I want to short BTC with 0.002 ETH at 4x leverage",
            toolInput: JSON.stringify({
                native: "ETH",
                asset: "BTC",
                chain: "421614",
                leverage: 4,
                positionSizeInNative: 0.002,
                isLong: false
            }),
            toolOutput: JSON.stringify({
                success: true,
                txHash: "0x7ef3a502c8e4294e91f4ad011206b9d3e12ac95a669ec6974482587e43a2ab91",
                explorerUrl: "https://sepolia.arbiscan.io/tx/0x7ef3a502c8e4294e91f4ad011206b9d3e12ac95a669ec6974482587e43a2ab91",
                position: {
                    asset: "BTC",
                    leverage: "4x",
                    direction: "SHORT",
                }
            }),
            outputResponse: "Successfully placed a 4x short position on BTC with 0.002 ETH. View tx in the explorer https://sepolia.arbiscan.io/tx/0x7ef3a502c8e4294e91f4ad011206b9d3e12ac95a669ec6974482587e43a2ab91"
        },
    ];


    return {
        name: "trading",
        description: "Enables users to place leveraged long or short positions on GMX",
        examples: examples,
        execute: async (input, agent) => {
            try {
                console.log(`🔧 Executing GMX trading tool with input: "${input}"`);

                // Parse the input
                const params = JSON.parse(input);

                // Validate required parameters
                const requiredParams = ['native', 'asset', 'chain', 'leverage', 'positionSizeInNative', 'isLong'];
                for (const param of requiredParams) {
                    if (!params[param] && params[param] !== false) {
                        throw new Error(`Missing required parameter: ${param}`);
                    }
                }

                // Default empty arrays if not provided
                const takeProfit = params.takeProfit || [];
                const stopLoss = params.stopLoss || [];
                const privateKey = await agent.getPrivateKey();
                // Log the trade details before execution
                console.log("Trade details:", {
                    privateKey: privateKey ? "Provided" : "Not provided",
                    native: params.native,
                    asset: params.asset,
                    chain: params.chain,
                    leverage: params.leverage,
                    positionSizeInNative: params.positionSizeInNative,
                    takeProfit: takeProfit,
                    stopLoss: stopLoss,
                    isLong: params.isLong
                });

                // Execute the trade
                const tx = await placeTrade(
                    privateKey,
                    params.native,
                    params.asset != 'ETH' ? 'ETH' : params.asset,
                    params.chain,
                    params.leverage,
                    params.positionSizeInNative,
                    takeProfit,
                    stopLoss,
                    params.isLong
                );

                // Extract tx hash
                const txHash = tx.hash;

                // Get explorer URL
                const explorerUrl = params.chain !== "421614"
                    ? `https://testnet.snowtrace.io/tx/${txHash}`
                    : `https://sepolia.arbiscan.io/tx/${txHash}`;

                // Format the response
                const result = {
                    success: true,
                    txHash: txHash,
                    explorerUrl: explorerUrl,
                    position: {
                        asset: params.asset != 'ETH' ? 'ETH' : params.asset,
                        leverage: `${params.leverage}x`,
                        direction: params.isLong ? "LONG" : "SHORT",
                    }
                };
                await agent.addTradingData({
                    action: {
                        "%allot": 'buy_more'
                    },
                    trade_data: {
                        is_long: {
                            "%allot": params.isLong
                        },
                        asset: {
                            "%allot": "ETH"
                        },
                        leverage: {
                            "%allot": params.leverage
                        },
                        amount: {
                            "%allot": params.positionSizeInNative
                        },
                        tx_hash: {
                            "%allot": txHash
                        },
                    },
                    explanation: {
                        "%allot": "N/A"
                    }
                })

                return JSON.stringify(result);
            } catch (error) {
                console.error("Error with GMX trading tool:", error);
                return JSON.stringify({
                    success: false,
                    error: "Insufficient funds or other error occurred",
                });
            }
        }
    };
}
