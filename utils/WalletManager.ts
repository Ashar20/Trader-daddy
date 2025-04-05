import { Client, Message } from "whatsapp-web.js";
import { privateKeyToAccount, type Account } from "viem/accounts";
import { createWalletClient, type WalletClient, http, Chain } from "viem";
import {
  celoAlfajores,
  polygonAmoy,
  rootstockTestnet,
  optimismSepolia,
} from "viem/chains";
import SignClient from "@walletconnect/sign-client";
import { SessionTypes, SignClientTypes } from "@walletconnect/types";
import { ethers } from "ethers";

interface ChatWallet {
  account: Account;
  clients: Map<number, WalletClient>; // Map chainId to client
  wcSessions: Map<string, SessionTypes.Struct>;
}

interface PendingRequest {
  chatId: string;
  messageId: string;
  type: "transaction";
  data: any;
}

interface EVMNamespace {
  chains?: string[];
  methods?: string[];
  events?: string[];
}

interface RequiredNamespaces {
  eip155?: EVMNamespace;
  [key: string]: EVMNamespace | undefined;
}

// Supported chains configuration
const SUPPORTED_CHAINS = {
  44787: celoAlfajores,
  80001: polygonAmoy,
  31337: rootstockTestnet,
  11155420: optimismSepolia,
} as const;

type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

export class WalletManager {
  private chatWallets: Map<string, ChatWallet>;
  private whatsappClient: Client;
  private signClient: SignClient | null;
  private pendingRequests: Map<string, PendingRequest>;
  private lastPairedChatId: string | null;

  constructor(whatsappClient: Client) {
    this.chatWallets = new Map();
    this.whatsappClient = whatsappClient;
    this.signClient = null;
    this.pendingRequests = new Map();
    this.lastPairedChatId = null;
    this.initializeWalletConnect();
  }

  private async initializeWalletConnect() {
    try {
      this.signClient = await SignClient.init({
        projectId: process.env.WALLETCONNECT_PROJECT_ID as string,
        metadata: {
          name: "WhatsApp Web3 Bot",
          description: "A WhatsApp bot for Web3 interactions",
          url: "https://your-website.com",
          icons: ["https://your-website.com/icon.png"],
        },
      });

      // Setup event listeners after successful initialization
      this.setupEventListeners();
      console.log("WalletConnect initialized and listeners set up");
    } catch (error) {
      console.error("Failed to initialize WalletConnect:", error);
    }
  }

 