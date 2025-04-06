import { Tool } from "langchain/tools";
import {
  celoAlfajores,
  polygonAmoy,
  rootstockTestnet,
  optimismSepolia,
  arbitrumSepolia,
} from "viem/chains";

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result: string;
  error?: {
    code: number;
    message: string;
  };
}

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

class WalletBalanceTool extends Tool {
  name = "check_wallet_balance";
  description =
    "Check the wallet balance for a given address. Input should be a valid Ethereum address and optionally a chain name or ID (e.g., '0x123... in arbitrum sepolia' or '0x123... on 421614'). Default chain is Optimism Sepolia.";

  async _call(input: string): Promise<string> {
    try {
      // Parse input to get address and optional chain
      let walletAddress: string;
      let chainId: number = 11155420; // Default to Optimism Sepolia

      // Validate input is not empty
      if (!input || input.trim() === "") {
        return "Please provide a wallet address to check the balance.";
      }

      // Check for different input formats
      if (input.includes(" in ")) {
        const [addr, chainName] = input
          .split(" in ")
          .map((s) => s.trim().toLowerCase());
        walletAddress = addr;
        chainId = CHAIN_NAME_TO_ID[chainName] || chainId;
      } else if (input.includes(" on ")) {
        const [addr, chainIdStr] = input.split(" on ").map((s) => s.trim());
        walletAddress = addr;
        chainId = parseInt(chainIdStr);
      } else {
        walletAddress = input.trim();
      }

      // Validate wallet address format
      if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return `Invalid wallet address format: ${walletAddress}. Please provide a valid Ethereum address.`;
      }

      // Validate chain ID
      if (!(chainId in SUPPORTED_CHAINS)) {
        return `Chain ID ${chainId} is not supported. Supported chains: ${Object.keys(
          SUPPORTED_CHAINS
        ).join(", ")}`;
      }

      const chain = SUPPORTED_CHAINS[chainId as SupportedChainId];
      const rpcUrl = chain.rpcUrls.default.http[0];

      console.log(
        `Fetching balance for ${walletAddress} on ${chain.name} (${rpcUrl})`
      );

      // Use viem to get the balance
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [walletAddress, "latest"],
          id: 1,
        }),
      });

      if (!response.ok) {
        console.error(
          `RPC request failed: ${response.status} ${response.statusText}`
        );
        return "Failed to fetch balance: RPC request failed";
      }

      const data = (await response.json()) as JsonRpcResponse;

      // Check for RPC error response
      if (data.error) {
        console.error(`RPC error: ${data.error.message}`);
        return `Failed to fetch balance: ${data.error.message}`;
      }

      // Validate result exists and is a valid hex string
      if (!data.result || !data.result.match(/^0x[a-fA-F0-9]+$/)) {
        console.error(`Invalid RPC result:`, data);
        return "Failed to fetch balance: Invalid response from RPC";
      }

      const balanceInWei = BigInt(data.result);
      const balanceInEth = Number(balanceInWei) / 1e18;

      return `The wallet balance for ${walletAddress} on ${
        chain.name
      } is ${balanceInEth.toFixed(4)} ${chain.nativeCurrency.symbol}`;
    } catch (error) {
      console.error("Error checking balance:", error);
      return `Failed to check balance: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }
}

export const createBalanceTool = () => {
  return new WalletBalanceTool();
};
