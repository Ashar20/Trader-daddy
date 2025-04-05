export interface Poll {
  creator: string;
  reason: string;
  amount: number;
  votes: Map<string, "yes" | "no">;
  timestamp: number;
  messageId: string;
}
