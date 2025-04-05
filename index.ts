import { Client, LocalAuth, Poll } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createStructuredChatAgent } from "langchain/agents";
import { pull } from "langchain/hub";


import { http } from "viem";
import { createWalletClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia } from "viem/chains";

import { getOnChainTools } from "@goat-sdk/adapter-langchain";
import { PEPE, USDC, erc20 } from "@goat-sdk/plugin-erc20";  

// import { uniswap } from "@goat-sdk/plugin-uniswap";


import { sendETH } from "@goat-sdk/wallet-evm";
import { viem } from "@goat-sdk/wallet-viem";
import { createMockTool } from "./tools/mockTool";
import { createPollTool } from "./tools/Poll";
import { on } from "events";

require("dotenv").config();


require("dotenv").config();

// Create a new WhatsApp client instance
const whatsappClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: "/usr/bin/chromium-browser",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

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
    whatsappClient.on("qr", (qr) => {
      console.log("QR RECEIVED", qr);
      qrcode.generate(qr, { small: true });
    });
  
    whatsappClient.once("ready", () => {
      console.log("WhatsApp Client is ready!");
    });
  
    // Debug all events
    whatsappClient.on("message", (message) => {
      // console.log("Message event:", message);
    });
  
    whatsappClient.on("message_ack", (message) => {
      // console.log("Message ack event:", message.body);
    });
  
    whatsappClient.on("message_reaction", async (message) => {
      // console.log("message_reaction event received:", message);
    });
    
    whatsappClient.on("message_create", async (message) => {
        console.log(
          "\n\nFrom",
          message.from.toString(),
          "Message",
          message.body,
          "To: ",
          message.to.toString()
        );
    
        // console.log(message);
        if (message.body && message.from.toString() != "918682028711@c.us") {
          try {
            const response = await agentExecutor.invoke({
              input:
                message.body +
                " From: " +
                message.from.toString() +
                " Chat ID: " +
                message.from.toString(),
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
      whatsappClient.initialize();
    })();
    