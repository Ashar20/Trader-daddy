import { SecretVaultWrapper } from "secretvaults";
import { loadTools } from "./tools/index.js";
import { loadServices } from "./services/index.js";
import crypto from "crypto";
import { privateKeyToAddress } from "viem/accounts";
import { JsonRpcVersionUnsupportedError, toHex } from "viem";
import { ethers } from "ethers";
import { initializeWalletAgent } from "./walletManager.js";
import { SheetClient } from "./sheets.api.js";
import { insertAgentLogEntry } from "./utils/sheetUtils.js";
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export class Agent {
  constructor(nodes) {
    this.tools = [];
    this.tempConversations = {};
    this.initialized = false;
    this.nillionChatCollection = null;
    this.nodes = nodes;
    this.sheetClient = null;
  }

  /**
   * Initialize the agent service
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log("Initializing agent service...");

    // Initialize tools
    this.tools = await loadTools();
    // Initialize Nillion collection
    const CREDENTIALS_PATH =
      process.env.GOOGLE_APPLICATION_CREDENTIALS || "./credentials.json";
    this.sheetClient = new SheetClient(process.env.SHEET_ID, CREDENTIALS_PATH);
    this.nillionChatCollection = new SecretVaultWrapper(
      this.nodes,
      {
        secretKey: process.env.NILLION_ORG_SECRET_KEY,
        orgDid: process.env.NILLION_ORG_DID,
      },
      process.env.NILLION_CHAT_SCHEMA_ID
    );

    // Service account credentials

    await this.nillionChatCollection.init();

    this.nillionUserCollection = new SecretVaultWrapper(
      this.nodes,
      {
        secretKey: process.env.NILLION_ORG_SECRET_KEY,
        orgDid: process.env.NILLION_ORG_DID,
      },
      process.env.NILLION_USER_SCHEMA_ID
    );
    await this.nillionUserCollection.init();

    this.nillionTradesCollection = new SecretVaultWrapper(
      this.nodes,
      {
        secretKey: process.env.NILLION_ORG_SECRET_KEY,
        orgDid: process.env.NILLION_ORG_DID,
      },
      process.env.NILLION_TRADES_SCHEMA_ID
    );

    await this.nillionTradesCollection.init();

    const email = process.env.GMAIL;
    const sheetId = process.env.SHEET_ID;
    const name = process.env.NAME;

    const currentTime = new Date().toISOString();

    const existingUser = await this.getUserFromGmailAndSheetId(email, sheetId);
    if (existingUser) {
      console.log("User wallet with this sheet Id already exists in Nillion");
      this.user_id = existingUser._id;
    } else {
      console.log("User does not exist in Nillion, creating new user");
      const secretSalt = crypto
        .getRandomValues(new Uint8Array(16))
        .reduce((salt, byte) => salt + byte.toString(16).padStart(2, "0"), "");

      const dataWritten = await this.nillionUserCollection.writeToNodes([
        {
          created_at: currentTime,
          sheet_id: {
            "%allot": sheetId,
          },
          secret_salt: {
            "%allot": secretSalt,
          },
          email: {
            "%allot": email,
          },
          agent: {
            url: {
              "%allot": "placeholder",
            },
            api_key: { "%allot": "placeholder" },
          },
          name,
          last_login: currentTime,
        },
      ]);
      const newIds = [
        ...new Set(dataWritten.map((item) => item.data.created).flat()),
      ];
      console.log(
        `Created User with new ID: ${newIds[0]} and encrypted in Nillion`
      );
      this.user_id = newIds[0];
    }
    console.log(privateKeyToAddress(await this.getPrivateKey()));
    this.services = loadServices(this);
    initializeWalletAgent(sheetId, await this.getPrivateKey(), this);
    this.initialized = true;
    console.log("Agent service initialized with Nillion encryption!");
  }

  /**
   * Process a user message and return the agent's response
   */
  async processMessage(message, conversationId) {
    // Ensure the agent is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`Processing conversation: ${conversationId}`);

    if (conversationId === "temp") {
      this.tempConversations[conversationId] = this.createNewConversation();
    }

    // Get or create conversation from Nillion or temporary storage
    if (!this.tempConversations[conversationId]) {
      // Try to load from Nillion first
      const existingConversations =
        await this.nillionChatCollection.readFromNodes({
          _id: conversationId,
        });
      console.log(JSON.stringify(existingConversations, null, 2));
      if (existingConversations && existingConversations.length > 0) {
        // Convert Nillion format to local format for processing
        this.tempConversations[conversationId] =
          existingConversations[0].messages;
      } else {
        // Create a new conversation with system message
        throw new Error("Something went wrong");
        // this.tempConversations[conversationId] = this.createNewConversation();
      }
    }

    // Add user message
    this.tempConversations[conversationId].push({
      role: "user",
      content: message,
    });

    // Get initial response from LLM
    const llmResponse = await this.callNilaiAPI(
      this.tempConversations[conversationId]
    );
    console.log(`🤖 Assistant (initial): ${llmResponse}`);
    console.log("Agent response ended");
    // Check if the response contains a tool call
    const toolCallRegex = /<tool>(.*?):(.*?)<\/tool>/;
    const match = llmResponse.match(toolCallRegex);

    let finalResponse = llmResponse;

    if (match) {
      // Extract tool name and input
      const toolName = match[1].trim();
      const toolInput = match[2].trim();

      console.log(`🔧 Using tool: ${toolName} with input: ${toolInput}`);

      // Find the tool
      const tool = this.tools.find((t) => t.name === toolName);

      if (tool) {
        // Execute the tool
        const toolResult = await tool.execute(toolInput, this);
        console.log(`🔧 Tool result received (${toolResult.length} chars)`);

        // Add assistant message with tool call
        this.tempConversations[conversationId].push({
          role: "assistant",
          content: llmResponse,
        });

        // Add tool result as a system message
        this.tempConversations[conversationId].push({
          role: "system",
          content: `Tool result: ${toolResult}`,
        });

        // Get final response from LLM
        finalResponse = await this.callNilaiAPI(
          this.tempConversations[conversationId]
        );
        console.log(
          `🤖 Assistant (final): ${finalResponse.substring(0, 100)}...`
        );

        // Add final response to conversation
        this.tempConversations[conversationId].push({
          role: "assistant",
          content: finalResponse,
        });
      } else {
        console.log(`❌ Tool "${toolName}" not found`);

        // Add response to conversation
        this.tempConversations[conversationId].push({
          role: "assistant",
          content: finalResponse,
        });
      }
    } else {
      // Add response to conversation
      this.tempConversations[conversationId].push({
        role: "assistant",
        content: finalResponse,
      });
    }

    // Save conversation to Nillion
    const updatedConversationId = await this.saveConversationToNillion(
      conversationId
    );

    return {
      conversationId: updatedConversationId,
      response: finalResponse,
    };
  }

  