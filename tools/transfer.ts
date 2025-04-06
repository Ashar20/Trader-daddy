import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { WalletManager } from "../utils/WalletManager";
import { parseEther } from "viem";
import {
  celoAlfajores,
  polygonAmoy,
  rootstockTestnet,
  optimismSepolia,
  arbitrumSepolia,
} from "viem/chains";

// Supported chains configuration
const SUPPORTED_CHAINS = {
  44787: celoAlfajores,
  80001: polygonAmoy,
  31337: rootstockTestnet,
  11155420: optimismSepolia,
  421614: arbitrumSepolia,
} as const;

// Chain name to ID mapping
const CHAIN_NAME_TO_ID: { [key: string]: number } = {
  celo: 44787,
  "celo alfajores": 44787,
  polygon: 80001,
  "polygon amoy": 80001,
  rootstock: 31337,
  "rootstock testnet": 31337,
  optimism: 11155420,
  "optimism sepolia": 11155420,
  arbitrum: 421614,
  "arbitrum sepolia": 421614,
};

type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

/**
 * Initialize the transfer tool
 */
export const createTransferTool = (walletManager: WalletManager) => {
  return new DynamicStructuredTool({
    name: "transfer",
    description: "Allows users to transfer assets via natural language",
    schema: z
      .object({
        token: z
          .string()
          .describe("The token symbol to transfer (e.g., ETH, USDC)"),
        amount: z.string().describe("The amount to transfer"),
        recipient: z.string().describe("The recipient's address"),
        chain: z
          .string()
          .optional()
          .describe("Optional chain ID or name for the transfer"),
        memo: z
          .string()
          .optional()
          .describe("Optional memo/note for the transfer"),
        chatId: z
          .string()
          .describe("The chat ID to identify the sender's wallet"),
      })
      .strict(),
    func: async (input: any) => {
      try {
        console.log(`🔧 Executing transfer tool with input:`, input);

        if (!input.chatId) {
          throw new Error(
            "Chat ID is required to identify the sender's wallet"
          );
        }

        // Parse chain input to get chain ID
        let chainId: number = 11155420; // Default to Optimism Sepolia
        if (input.chain) {
          // Try parsing as direct chain ID first
          const parsedChainId = parseInt(input.chain);
          if (
            !isNaN(parsedChainId) &&
            parsedChainId.toString() === input.chain
          ) {
            chainId = parsedChainId;
          } else {
            // Try matching chain name
            const normalizedChainName = input.chain.toLowerCase().trim();
            const mappedChainId = CHAIN_NAME_TO_ID[normalizedChainName];
            if (mappedChainId) {
              chainId = mappedChainId;
            } else {
              throw new Error(
                `Unsupported chain: ${
                  input.chain
                }. Supported chains: ${Object.keys(CHAIN_NAME_TO_ID).join(
                  ", "
                )}`
              );
            }
          }
        }

        if (!(chainId in SUPPORTED_CHAINS)) {
          throw new Error(`Chain ID ${chainId} is not supported`);
        }

        const chain = SUPPORTED_CHAINS[chainId as SupportedChainId];
        const amount = parseEther(input.amount);

        if (
          input.token !== "ETH" &&
          input.token !== chain.nativeCurrency.symbol
        ) {
          throw new Error(
            "Only native token transfers are supported currently"
          );
        }

        // Get the wallet address for this chat
        const senderAddress = await walletManager.getWalletAddress(
          input.chatId
        );
        if (!senderAddress) {
          throw new Error("No wallet found for this chat");
        }

        // Get the wallet client for this chain
        const walletClient = (walletManager as any).getWalletClient(
          input.chatId,
          chainId
        );
        if (!walletClient) {
          throw new Error("No wallet client available for this chain");
        }

        // Send the transaction
        const hash = await walletClient.sendTransaction({
          to: input.recipient as `0x${string}`,
          value: amount,
          chain: chain,
          account: walletClient.account,
        });

        // Get block explorer URL
        const explorerUrl = chain.blockExplorers?.default
          ? `${chain.blockExplorers.default.url}/tx/${hash}`
          : null;

        const result = {
          success: true,
          hash: hash,
          explorerUrl: explorerUrl,
          message: `Successfully initiated transfer of ${input.amount} ${chain.nativeCurrency.symbol} to ${input.recipient} on ${chain.name}`,
          timestamp: new Date().toISOString(),
        };

        return JSON.stringify(result);
      } catch (error) {
        console.error("Error with transfer tool:", error);
        if (error instanceof Error) {
          throw new Error(`Error executing transfer: ${error.message}`);
        }
        throw new Error("Error executing transfer: An unknown error occurred.");
      }
    },
  });
};
