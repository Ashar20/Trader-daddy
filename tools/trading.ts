import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { placeTrade } from "../utils/gmx";

/**
 * Initialize the trading tool for executing trades on GMX
 */
export const createTradingTool = () => {
  if (!process.env.ALCHEMY_API_KEY) {
    console.warn("Warning: ALCHEMY_API_KEY environment variable not set");
  }

  return new DynamicStructuredTool({
    name: "trading",
    description:
      "Enables users to place leveraged long or short positions on GMX",
    schema: z
      .object({
        native: z
          .string()
          .describe("The native token to trade with (e.g., ETH)"),
        asset: z.string().describe("The asset to trade (e.g., BTC, ETH)"),
        chain: z
          .string()
          .transform((val) => {
            const chainIdMap: Record<string, string> = {
              "421614": "421614",
              "421611": "421614", // Legacy chain ID
              "arbitrum sepolia": "421614",
              arbitrumsepolia: "421614",
            };
            const normalizedChain = val.toLowerCase().replace(/\s+/g, "");
            return chainIdMap[normalizedChain] || val;
          })
          .describe(
            "The chain ID or network name (e.g., 421614 or 'Arbitrum Sepolia')"
          ),
        leverage: z
          .union([z.string(), z.number()])
          .transform((val) => {
            const numericValue =
              typeof val === "string"
                ? Number(val.toString().replace("x", ""))
                : Number(val);
            if (
              isNaN(numericValue) ||
              numericValue <= 0 ||
              numericValue > 100
            ) {
              throw new Error("Leverage must be a number between 1 and 100");
            }
            return numericValue;
          })
          .describe("The leverage multiplier to use (e.g., 3 or '3x')"),
        positionSizeInNative: z
          .union([z.string(), z.number()])
          .transform((val) => Number(val))
          .refine((val) => !isNaN(val) && val > 0, {
            message: "Position size must be a positive number",
          })
          .describe("The position size in native token"),
        isLong: z
          .union([z.boolean(), z.string()])
          .transform((val) => {
            if (typeof val === "boolean") return val;
            return val.toLowerCase() === "long" || val.toLowerCase() === "true";
          })
          .describe(
            "Whether this is a long position (true/false or 'long'/'short')"
          ),
        takeProfit: z
          .array(z.string())
          .optional()
          .describe("Optional take profit levels"),
        stopLoss: z
          .array(z.string())
          .optional()
          .describe("Optional stop loss levels"),
      })
      .passthrough(), // Allow extra fields instead of strict()
    func: async (input: any) => {
      try {
        // Debug: Log raw input
        console.log("🔍 Raw input received:", JSON.stringify(input, null, 2));

        // Validate required environment variables
        if (!process.env.WALLET_PRIVATE_KEY) {
          throw new Error("WALLET_PRIVATE_KEY environment variable not set");
        }
        if (!process.env.ALCHEMY_API_KEY) {
          throw new Error("ALCHEMY_API_KEY environment variable not set");
        }

        // Validate input parameters
        console.log("🔧 Validating input parameters...");

        // Validate chain
        const chainIdMap: Record<string, string> = {
          "421614": "421614",
          "421611": "421614", // Legacy chain ID
          "arbitrum sepolia": "421614",
          arbitrumsepolia: "421614",
        };

        const normalizedChain = input.chain
          .toString()
          .toLowerCase()
          .replace(/\s+/g, "") as string;
        const mappedChainId = chainIdMap[normalizedChain];

        if (mappedChainId) {
          if (normalizedChain !== "421614") {
            input.chain = "421614";
            console.log(
              `⚠️ Auto-correcting chain identifier "${input.chain}" to 421614 (Arbitrum Sepolia)`
            );
          }
        } else {
          throw new Error(
            `Invalid chain identifier: ${input.chain}. Supported chains: 421614 or "Arbitrum Sepolia"`
          );
        }

        // Validate leverage
        if (input.leverage <= 0 || input.leverage > 100) {
          throw new Error(
            `Invalid leverage: ${input.leverage}. Must be between 1 and 100`
          );
        }

        // Validate position size
        if (input.positionSizeInNative <= 0) {
          throw new Error(
            `Invalid position size: ${input.positionSizeInNative}. Must be greater than 0`
          );
        }

        // Default empty arrays if not provided
        const takeProfit = input.takeProfit || [];
        const stopLoss = input.stopLoss || [];

        // Get private key from agent context
        const privateKey = process.env.WALLET_PRIVATE_KEY;

        // Log the validated trade details
        console.log("✅ Validated trade details:", {
          native: input.native,
          asset: input.asset,
          chain: input.chain,
          leverage: input.leverage,
          positionSizeInNative: input.positionSizeInNative,
          takeProfit,
          stopLoss,
          isLong: input.isLong,
          hasPrivateKey: !!privateKey,
        });

        console.log("🚀 Executing trade on GMX...");

        // Execute the trade
        const tx = await placeTrade(
          privateKey,
          input.native,
          input.asset != "ETH" ? "ETH" : input.asset,
          input.chain,
          input.leverage.toString(),
          input.positionSizeInNative.toString(),
          takeProfit,
          stopLoss,
          input.isLong
        );

        console.log("✅ Trade executed successfully:", tx.hash);

        // Extract tx hash
        const txHash = tx.hash;

        // Get explorer URL
        const explorerUrl =
          input.chain !== "421614"
            ? `https://testnet.snowtrace.io/tx/${txHash}`
            : `https://sepolia.arbiscan.io/tx/${txHash}`;

        // Format the response
        const result = {
          success: true,
          txHash: txHash,
          explorerUrl: explorerUrl,
          position: {
            asset: input.asset != "ETH" ? "ETH" : input.asset,
            leverage: `${input.leverage}x`,
            direction: input.isLong ? "LONG" : "SHORT",
          },
        };

        console.log("📊 Final result:", JSON.stringify(result, null, 2));

        if (input.agent?.addTradingData) {
          await input.agent.addTradingData({
            action: {
              "%allot": "buy_more",
            },
            trade_data: {
              is_long: {
                "%allot": input.isLong,
              },
              asset: {
                "%allot": "ETH",
              },
              leverage: {
                "%allot": input.leverage,
              },
              amount: {
                "%allot": input.positionSizeInNative,
              },
              tx_hash: {
                "%allot": txHash,
              },
            },
            explanation: {
              "%allot": "N/A",
            },
          });
        } else {
          console.log("⚠️ Warning: agent.addTradingData not available");
        }

        return JSON.stringify(result);
      } catch (error: any) {
        // Enhanced error logging
        console.error("❌ Error with GMX trading tool:", {
          message: error.message,
          stack: error.stack,
          input: JSON.stringify(input, null, 2),
        });
        throw new Error(`Trading error: ${error.message}`);
      }
    },
  });
};
