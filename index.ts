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
import { createMockTool } from "./tools/mockTool";
import { createPollTool } from "./tools/Poll";
import { WalletManager } from "./utils/WalletManager";
import { on } from "events";

require("dotenv").config();

// Create a new WhatsApp client instance
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-software-rasterizer",
      "--disable-features=site-per-process",
      "--ignore-certificate-errors",
      "--no-first-run",
      "--window-size=1920,1080",
      "--start-maximized",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
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
}) as WalletClient;

(async (): Promise<void> => {
  // 2. Get your onchain tools for your wallet
  const onchainTools = await getOnChainTools({
    wallet: viem(walletClient),
    plugins: [sendETH(), erc20({ tokens: [USDC, PEPE] })],
  });

  // Add mock tool to the tools array
  const tools = [...onchainTools, createMockTool(), createPollTool()];

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
