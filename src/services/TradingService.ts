import { placeTrade } from "../tools/gmx/index.js";
import { processCandles } from "./utils/candles.js";
import { processSentimentCryptoPanic } from "./utils/cryptopanic.js";
import { generateEmbeddings } from "./utils/supavec.js";

export class TradingService {
    constructor(agent) {
        this.name = "Trading";
        this.agent = agent;
        this.timer = null;
    }

    async start() {
        await this.executeTradeLogic();
        // Start the periodic trading logic
        this.timer = setInterval(async () => {
            await this.executeTradeLogic();
        }, 10 * 60 * 1000); // 10 minutes in milliseconds

        console.log("Trading service started, will run every 10 minutes");
    }

    async stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log("Trading service stopped");
        }
    }

    async executeTradeLogic() {
        try {
            console.log("Starting trade logic execution...");

            // 1. Check balance first
            console.log("Checking balance...");
            const balance = await this.agent.getBalance();
            console.log(`Current balance: ${balance}`);

            if (balance < BigInt("2000000000000000")) {
                console.log("Insufficient balance (< 0.002 ETH) to perform trade operations");
                return {
                    decision: "stay_idle",
                    reason: "Insufficient balance (< 0.002 ETH)"
                };
            }

            // 3. Gather all necessary trading data
            console.log("Gathering trading data...");
            const [candleStickData, socialSentiment] = await Promise.all([
                processCandles("ETH"),
                processSentimentCryptoPanic("ETH", this.agent),
            ]);
            console.log("Trading data gathered successfully.");

            // 4. Generate embeddings using RAG service
            console.log("Generating embeddings...");
            const embeddingsData = await generateEmbeddings(
                'ETH',
                candleStickData,
                socialSentiment,
            );
            console.log("Embeddings generated successfully.");

            console.log("Processing analysis for decision-making...");
            const decision = await this.agent.processAnalysis({
                marketData: candleStickData,
                socialSentiment: socialSentiment,
            }, embeddingsData);
            console.log(`Decision made: ${JSON.stringify(decision)}`);

            let selectedTrade = null;
            if (decision.action === "close_position") {
                console.log(`Fetching trade details for trade ID: ${decision.data.trade_id}`);
                selectedTrade = await this.agent.getTradeById(decision.data.trade_id);
                console.log(`Selected trade: ${JSON.stringify(selectedTrade)}`);
            }

            // 6. Execute the decision
            console.log("Executing decision...");
            const result = await this.executeDecision(decision, selectedTrade);
            console.log("Decision executed successfully:", result);

            return result;

        } catch (error) {
            console.error("Error in trading execution:", error);
        }
    }


    async executeDecision(decision, selectedTrade) {
        switch (decision.action) {
            case "buy_more":

                const { hash } = await placeTrade(
                    await this.agent.getPrivateKey(),
                    'ETH',
                    'ETH',
                    '421614',
                    decision.data.leverage,
                    decision.data.amount,
                    [],
                    [],
                    decision.data.isLong
                );
                await this.agent.addTradingData({
                    action: {
                        "%allot": 'buy_more'
                    },
                    trade_data: {
                        is_long: {
                            "%allot": decision.data.isLong.toString()
                        },
                        asset: {
                            "%allot": "ETH"
                        },
                        leverage: {
                            "%allot": decision.data.leverage.toString()
                        },
                        amount: {
                            "%allot": decision.data.amount.toString()
                        },
                        tx_hash: {
                            "%allot": hash
                        },
                    },
                    explanation: {
                        "%allot": decision.reason
                    }
                })
                return {
                    success: true,
                }

            case "close_position":
                await this.agent.addTradingData({
                    action: {
                        "%allot": 'close_position'
                    },
                    trade_data: {
                        is_long: {
                            "%allot": selectedTrade.isLong.toString()
                        },
                        asset: {
                            "%allot": "ETH"
                        },
                        leverage: {
                            "%allot": selectedTrade.leverage.toString()
                        },
                        amount: {
                            "%allot": selectedTrade.amount.toString()
                        },
                        reference_trade_id: {
                            "%allot": decision.data.trade_id
                        }
                    },
                    explanation: {
                        "%allot": decision.reason
                    }
                })
                return {
                    success: true,
                }
            case "stay_idle":
            default:
                await this.agent.addTradingData({
                    action: {
                        "%allot": 'stay_idle'
                    },
                    explanation: {
                        "%allot": decision.reason
                    }
                })
                return {
                    success: true,
                }
        }
    }
}