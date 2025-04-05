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
  
  
  async processAnalysis(collectedData, embeddings) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Get existing trade positions
    const positions = await this.getActiveTrades();

    // Extract market data and social sentiment from input
    const { marketData, socialSentiment } = collectedData;

    // Construct the prompt with all available data
    const prompt = `
    You are an AI trading assistant. Analyze the following data and recommend a trading action.
    
    MARKET DATA:
    ${JSON.stringify(marketData, null, 2)}
    
    SOCIAL SENTIMENT:
    ${JSON.stringify(socialSentiment, null, 2)}
    
    TECHNICAL ANALYSIS:
    ${JSON.stringify(embeddings, null, 2)}
    
    ${
      positions.length > 0
        ? "CURRENT POSITIONS: \n" + JSON.stringify(positions, null, 2)
        : "NO ACTIVE POSITIONS."
    }
    
    WALLET BALANCE: ${await this.getBalance()} ETH

    Based on the above data, recommend ONE of the following actions:
    1. "stay_idle" - Don't make any trades
    2. "buy_more" - Enter a new position or add to existing
    ${
      positions.length > 0
        ? `3. "close_position" - Close an existing position`
        : ""
    }
    
    Provide your recommendation in ONE of the following JSON formats based on your analysis:
    
    If recommending to stay idle:
    {
      "action": "stay_idle",
      "reason": "detailed explanation of why no action should be taken",
      "data": {}
    }
    
    If recommending to buy more:
    {
      "action": "buy_more",
      "reason": "detailed explanation of why this trade should be executed",
      "data": {
        "asset": "asset_symbol",
        "amount": numeric_amount,
        "leverage": numeric_leverage,
        "isLong": boolean (true for long, false for short)
      }
    }

    ${
      positions.length > 0
        ? `If recommending to close a position:
    {
      "action": "close_position",
      "reason": "detailed explanation of why the position should be closed",
      "data": {
        "trade_id": "id_of_position_to_close"
      }
    }`
        : ""
    }
    `;

    // Call the LLM API with the constructed prompt
    const llmResponse = await this.callNilaiAPI([
      {
        role: "system",
        content:
          "You are an advanced trading assistant that analyzes market data and makes trading decisions.",
      },
      { role: "user", content: prompt },
    ]);

    console.log(`🤖 Assistant (initial): ${llmResponse}`);

    // Parse the response to extract the JSON
    try {
      // Extract JSON from the response (handling cases where there might be additional text)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : llmResponse;

      // Parse the JSON
      const decision = JSON.parse(jsonString);

      // Validate the response format
      if (
        !["stay_idle", "buy_more", "close_position"].includes(decision.action)
      ) {
        throw new Error("Invalid action in response");
      }

      // Validate data based on action
      if (decision.action === "close_position" && !decision.data.trade_id) {
        throw new Error("Missing trade_id for close_position action");
      }

      if (
        decision.action === "buy_more" &&
        (!decision.data.asset ||
          !decision.data.amount ||
          !decision.data.leverage ||
          (decision.data.isLong === undefined &&
            decision.data.isShort === undefined))
      ) {
        throw new Error("Missing required fields for buy_more action");
      }

      return decision;
    } catch (error) {
      console.error("Error parsing LLM response:", error);
      // Fallback to a safe default
      return {
        action: "stay_idle",
        reason:
          "Something went wrong with the analysis. Let's try again later.",
        data: {},
      };
    }
  }

  /**
   * Call the Nilai API
   */
  async callNilaiAPI(messages) {
    // Using this to satisfy class-methods-use-this rule
    if (!this.initialized) {
      console.log("Warning: API call before full initialization");
    }

    const apiUrl = process.env.NILAI_API_URL;
    const apiKey = process.env.NILAI_API_KEY;

    if (!apiUrl || !apiKey) {
      throw new Error(
        "Missing NILAI_API_URL or NILAI_API_KEY environment variables"
      );
    }

    try {
      console.log("Calling Nilai API...");
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.1-8B-Instruct",
          messages,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling Nilai API:", error);
      throw error;
    }
  }

  async addTradingData(tradeData) {
    const currentTime = new Date().toISOString();
    const tradeAction = tradeData.action["%allot"] || "";
    const tradeExplanation = tradeData.explanation["%allot"] || "";
    if (tradeAction === "stay_idle") {
      const logEntryData = {
        action: tradeAction || "",
        explanation: tradeExplanation || "",
        trade_data: {
          tx_hash: "",
        },
      };
      try {
        await insertAgentLogEntry(this.sheetClient, logEntryData);
        console.log(
          `Successfully added trade log entry for action: ${tradeData.action["%allot"]}`
        );
      } catch (error) {
        console.error(`Error adding trade log entry: ${error.message}`);
      }
      return;
    }
    const tradeTxHash = tradeData.trade_data.tx_hash["%allot"] || "";

    // Format the data for the log entry
    const logEntryData = {
      action: tradeAction || "",
      explanation: tradeExplanation || "",
      trade_data: {
        tx_hash: tradeTxHash || "",
      },
    };

    // Call the insertAgentLogEntry function to update logs
    try {
      await insertAgentLogEntry(this.sheetClient, logEntryData);
      console.log(
        `Successfully added trade log entry for action: ${tradeData.action["%allot"]}`
      );
    } catch (error) {
      console.error(`Error adding trade log entry: ${error.message}`);
    }
    console.log("Adding trade data to Nillion");
    console.log(
      JSON.stringify(
        {
          ...tradeData,
          created_at: currentTime,
          user_id: {
            "%allot": this.user_id,
          },
        },
        null,
        2
      )
    );
    const dataWritten = await this.nillionTradesCollection.writeToNodes([
      {
        ...tradeData,
        created_at: currentTime,
        user_id: {
          "%allot": this.user_id,
        },
      },
    ]);
    const newIds = [
      ...new Set(dataWritten.map((item) => item.data.created).flat()),
    ];
    console.log(
      `Trade data encrypted in Nillion and saved with new ID: ${newIds[0]} `
    );
    return newIds[0];
  }

  async getAllTradeActions() {
    const trades = await this.nillionTradesCollection.readFromNodes({
      user_id: this.user_id,
    });
    return trades;
  }

  async getActiveTrades() {
    const trades = await this.nillionTradesCollection.readFromNodes({
      user_id: this.user_id,
    });
    const buyTrades = trades.filter((trade) => trade.action === "buy_more");
    const closeTrades = trades.filter(
      (trade) => trade.action === "close_position"
    );
    const closedTradeIds = closeTrades.map(
      (trade) => trade.trade_data.reference_trade_id
    );
    return buyTrades.filter(
      (trade) => !closedTradeIds.includes(trade.trade_data.reference_trade_id)
    );
  }

  async getTradeById(tradeId) {
    const trades = await this.nillionTradesCollection.readFromNodes({
      _id: tradeId,
    });
    if (trades.length === 0) {
      throw new Error(`Trade with ID ${tradeId} not found`);
    }
    return trades[0];
  }
  /**
   * Create a new conversation with system message
   */
  createNewConversation() {
    // Create tool information with descriptions and examples
    let toolInfo = "";

    // Use map and join instead of for...of
    toolInfo = this.tools
      .map((tool) => {
        const toolDescription = `## ${tool.name}\n${tool.description}\n\nExamples:\n`;

        // Use map and join for examples too
        const exampleText = tool.examples
          .map(
            (example) => `
User: "${example.userQuery}"
Tool with input: <tool>${tool.name}: ${example.toolInput}</tool>
Expected Tool Output Response Format: ${example.toolOutput}
`
          )
          .join("");

        return `${toolDescription + exampleText}\n\n`;
      })
      .join("");

    return [
      {
        role: "system",
        content: `You are a helpful assistant with access to tools. Follow these steps:
1. If a user's request requires current data or information you don't have, use an available tool.
2. To use a tool, respond with: <tool>tool_name: tool_input</tool>
3. After receiving tool results, provide a helpful response incorporating the information.
4. After executing a tool or if a tool fails, just provide the response. DO NOT suggest any other tools.
5. If a user's request is not clear, ask for more information.

# Available Tools and Usage Examples
${toolInfo}

Always use tools when appropriate rather than making up information. Study the examples carefully to understand when and how to use each tool.`,
      },
    ];
  }

  /**
   * Convert local format to Nillion format for storage
   */
  convertToNillionFormat(conversationId) {
    const messages = this.tempConversations[conversationId];
    const currentTime = new Date().toISOString();

    // Convert messages to Nillion format
    const encryptedMessages = messages.map((message, index) => {
      // Calculate a reasonable timestamp with 30 second intervals between messages
      const timestamp = new Date(
        Date.now() - (messages.length - index) * 30000
      ).toISOString();

      return {
        role: message.role,
        content: {
          "%allot": message.content,
        },
        timestamp,
      };
    });

    return {
      user_id: this.user_id,
      created_at: encryptedMessages[0].timestamp,
      updated_at: currentTime,
      messages: encryptedMessages,
    };
  }

  /**
   * Save conversation to Nillion
   */
  async saveConversationToNillion(conversationId) {
    try {
      console.log(`Starting to save conversation with ID: ${conversationId}`);
      const conversation = this.tempConversations[conversationId];
      console.log(JSON.stringify(conversation, null, 2));
      if (!conversation) {
        console.log(
          `Conversation with ID: ${conversationId} not found in temporary storage`
        );
        throw new Error("Conversation not found");
      }

      console.log(
        `Converting conversation with ID: ${conversationId} to Nillion format`
      );
      const encryptedConversation = this.convertToNillionFormat(conversationId);

      if (conversationId === "temp") {
        console.log("Saving new conversation to Nillion");
        const dataWritten = await this.nillionChatCollection.writeToNodes([
          encryptedConversation,
        ]);
        const newIds = [
          ...new Set(dataWritten.map((item) => item.data.created).flat()),
        ];
        console.log(
          `Conversation saved with new ID: ${newIds[0]} and encrypted in Nillion`
        );
        return newIds[0];
      }
      console.log(
        `Updating existing conversation with ID: ${conversationId} in Nillion`
      );
      await this.nillionChatCollection.updateDataToNodes(
        encryptedConversation,
        {
          _id: conversationId,
        }
      );
      console.log(
        `Conversation with ID: ${conversationId} successfully updated in Nillion`
      );
      return conversationId;
    } catch (error) {
      console.error(
        `Error saving conversation ${conversationId} to Nillion:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retrieve conversation history for a user
   */
  async getConversations() {
    try {
      // Query Nillion for all conversations for this user
      const conversations = await this.nillionChatCollection.readFromNodes({
        user_id: this.user_id,
      });

      // Return metadata only for listing purposes
      return conversations;
    } catch (error) {
      console.error(
        `Error retrieving conversation history for user ${this.user_id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId) {
    try {
      // Delete from Nillion
      await this.nillionChatCollection.deleteDataFromNodes({
        $and: [{ user_id: this.user_id }, { _id: conversationId }],
      });

      // Also remove from temporary storage if exists
      if (this.tempConversations[conversationId]) {
        delete this.tempConversations[conversationId];
      }

      console.log(`Conversation ${conversationId} deleted from Nillion`);
    } catch (error) {
      console.error(
        `Error deleting conversation ${conversationId} from Nillion:`,
        error
      );
      throw error;
    }
  }

  async getPrivateKey() {
    const userResponse = await this.nillionUserCollection.readFromNodes({
      _id: this.user_id,
    });
    console.log("Fetching Private key from Nillion");
    const pKey = this.generatePrivateKey(userResponse[0].secret_salt);
    console.log("Private key fetched from Nillion");
    return pKey;
  }

  generatePrivateKey(salt) {
    const derivedKey = crypto.pbkdf2Sync(
      "password",
      salt,
      2048, // Iterations
      32, // 32 bytes = 256 bits (Ethereum private key length)
      "sha256"
    );
    return "0x" + derivedKey.toString("hex");
  }

  async getUserFromGmailAndSheetId(email, sheetId) {
    console.log("Retreiving User from Nillion");
    console.log("Email: ", email);
    console.log("Sheet Id: ", sheetId);
    const userResponse = await this.nillionUserCollection.readFromNodes({});
    const user = userResponse.filter(
      (user) => user.email === email && user.sheet_id === sheetId
    );
    if (user.length === 0) {
      return null;
    } else {
      console.log(JSON.stringify(user[0], null, 2));
      return user[0];
    }
  }

  async getBalance() {
    const privateKey = await this.getPrivateKey();
    const rpcUrl =
      "https://arb-sepolia.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY;
    console.log("Connecting to RPC URL:", rpcUrl);
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log("Wallet address:", await wallet.getAddress());
    return (await wallet.getBalance()).toBigInt();
  }

  async configureAuth(url, apiKey) {
    const userData = await this.nillionUserCollection.readFromNodes({
      _id: this.user_id,
    });

    const user = userData[0];

    const updatedUser = {
      email: {
        "%allot": user.email,
      },
      secret_salt: {
        "%allot": user.secret_salt,
      },
      sheet_id: {
        "%allot": user.sheet_id,
      },
      name: user.name,
      last_login: user.last_login,
      created_at: user.created_at,
      agent: {
        url: {
          "%allot": url,
        },
        api_key: {
          "%allot": apiKey,
        },
      },
    };

    await this.nillionUserCollection.updateDataToNodes(updatedUser, {
      _id: this.user_id,
    });
  }

  async getUrl() {
    const userData = await this.nillionUserCollection.readFromNodes({
      _id: this.user_id,
    });

    return userData[0].agent.url;
  }
}
