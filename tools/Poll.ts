import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Define poll-related types
interface PollData {
  creator: string;
  reason: string;
  amount: number;
  votes: Map<string, "yes" | "no">;
  timestamp: number;
  messageId: string;
  status: "active" | "closed";
}

