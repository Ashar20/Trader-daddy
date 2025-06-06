import { Client, LocalAuth, Poll } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createStructuredChatAgent } from "langchain/agents";
import { pull } from "langchain/hub";
// import { uniswap } from "@goat-sdk/plugin-uniswap";

import { http } from "viem";
import { createWalletClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia } from "viem/chains";

import { getOnChainTools } from "@goat-sdk/adapter-langchain";
import { PEPE, USDC, erc20 } from "@goat-sdk/plugin-erc20";

import { sendETH } from "@goat-sdk/wallet-evm";
import { viem } from "@goat-sdk/wallet-viem";
import { createPollTool } from "./tools/Poll";
import { WalletManager } from "./utils/WalletManager";
import { createSearchTool } from "./tools/search";
import { createPriceTool } from "./tools/price";
import { createTransactionTool } from "./tools/transaction";
import { createTransferTool } from "./tools/transfer";
import { createTradingTool } from "./tools/trading";
import { createBalanceTool } from "./tools/balance";
import { on } from "events";

require("dotenv").config();

// Create a new WhatsApp client instance
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 60000,
  },
});

// Initialize WalletManager
const walletManager = new WalletManager(client);

// 1. Create a wallet client
const account = privateKeyToAccount(
  process.env.WALLET_PRIVATE_KEY as `0x${string}`
);

const walletClient = createWalletClient({
  account,
  chain: optimismSepolia,
  transport: http(process.env.RPC_PROVIDER_URL),
});

(async (): Promise<void> => {
  // 2. Get your onchain tools for your wallet
  const onchainTools = await getOnChainTools({
    wallet: viem(walletClient as WalletClient),
    plugins: [],
  });

  // Add mock tool to the tools array
  const tools = [
    // ...onchainTools,
    createPollTool(),
    createBalanceTool(),
    createSearchTool(),
    createPriceTool(),
    createTransactionTool(),
    createTransferTool(),
    createTradingTool(),
  ];
  // 3. Create the LLM and agent
  const llm = new ChatOpenAI({
    model: "gpt-4",
  });

  const prompt = await pull<ChatPromptTemplate>(
    "hwchase17/structured-chat-agent"
  );

  const agent = await createStructuredChatAgent({
    llm,
    tools: tools as any,
    prompt,
  });

  const agentExecutor = new AgentExecutor({
    agent,
    tools: tools as any,
  });

  // WhatsApp client event handlers
  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.generate(qr, { small: true });
  });

  client.once("ready", () => {
    console.log("WhatsApp Client is ready!");
  });

  client.on("message_create", async (message) => {
    console.log(
      "\n\nFrom",
      message.from.toString(),
      "Message",
      message.body,
      "To: ",
      message.to.toString(),
      "Type: ",
      message.type
    );

    // Check if the message is a WalletConnect URI
    if (message.body.toLowerCase().startsWith("wc:")) {
      await walletManager.handleWalletConnectUri(message);
      return;
    }

    // Handle other messages with the agent
    if (message.body && message.from.toString() != "918682028711@c.us") {
      try {
        // Get the chat's wallet address
        const walletAddress = await walletManager.getWalletAddress(
          message.from
        );

        const response = await agentExecutor.invoke({
          input:
            message.body +
            " From: " +
            message.from.toString() +
            " Chat ID: " +
            message.from.toString() +
            " Wallet Address: " +
            walletAddress,
        });

        // Send the agent's response back to WhatsApp
        await message.reply(response.output);
      } catch (error) {
        console.error("Error processing agent request:", error);
        await message.reply(
          "Sorry, I encountered an error processing your request."
        );
      }
    }
  });

  // Initialize WhatsApp client
  let initAttempts = 0;
  const maxAttempts = 3;

  const initializeWithRetry = async () => {
    try {
      console.log("Attempting to initialize WhatsApp client...");
      await client.initialize();
      console.log("WhatsApp client initialized successfully!");
    } catch (error) {
      console.error("Error during initialization:", error);
      initAttempts++;

      if (initAttempts < maxAttempts) {
        console.log(
          `Retrying initialization (attempt ${
            initAttempts + 1
          }/${maxAttempts})...`
        );
        // Wait 5 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await initializeWithRetry();
      } else {
        console.error("Failed to initialize after maximum attempts");
        process.exit(1);
      }
    }
  };

  await initializeWithRetry();
})();
