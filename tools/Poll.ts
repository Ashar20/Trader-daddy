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

// Map to store active polls in groups
const activePolls = new Map<string, PollData>();

// Function to create a poll message
function createPollMessage(poll: PollData): string {
  let yesVotes = 0;
  let noVotes = 0;

  poll.votes.forEach((vote) => {
    if (vote === "yes") yesVotes++;
    else if (vote === "no") noVotes++;
  });

  const timeLeft = Math.max(
    0,
    Math.floor((poll.timestamp + 86400000 - Date.now()) / 3600000)
  );

  return (
    `💰 *MONEY REQUEST POLL* 💰\n\n` +
    `*${poll.creator}* is asking for *$${poll.amount.toFixed(2)}*\n` +
    `*Reason:* ${poll.reason}\n\n` +
    `*TO VOTE:*\n` +
    `• React with 👍 to help with this request\n` +
    `• React with 👎 to decline\n\n` +
    `Poll expires in ${timeLeft} hours. Current votes: ${yesVotes} yes, ${noVotes} no`
  );
}

// Function to check if a poll has expired
function isPollExpired(poll: PollData): boolean {
  return Date.now() - poll.timestamp > 86400000; // 24 hours
}

// Function to get poll status
function getPollStatus(poll: PollData): string {
  if (poll.status === "closed") return "closed";
  if (isPollExpired(poll)) return "expired";
  return "active";
}

// Function to parse message content for poll creation
function parsePollCreationMessage(
  message: string
): { reason: string; amount: number } | null {
  // Common patterns for money requests
  const patterns = [
    /(?:need|want|requesting|asking for) (\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)\s*(?:for|to|towards)/i,
    /can (?:someone|anyone) help with (\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|bucks?)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      const reason = message.replace(match[0], "").trim();
      return { amount, reason: reason || "No specific reason provided" };
    }
  }

  return null;
}

// Create poll management tool
export const createPollTool = () => {
  return new DynamicStructuredTool({
    name: "manage_poll",
    description:
      "A tool to manage money request polls in group chats. Automatically detects money requests and handles reactions.",
    schema: z
      .object({
        message: z.string().describe("The message content"),
        chatId: z.string().describe("The chat ID where the message was sent"),
        senderId: z.string().describe("The ID of the message sender"),
        isReaction: z
          .boolean()
          .optional()
          .describe("Whether this is a reaction to a message"),
        reaction: z
          .string()
          .optional()
          .describe("The reaction emoji if this is a reaction"),
        quotedMessageId: z
          .string()
          .optional()
          .describe("The ID of the quoted message if this is a reaction"),
      })
      .strict(),
    func: async (input: any) => {
      try {
        console.log("Poll tool received input:", input);
        const {
          message,
          chatId,
          senderId,
          isReaction,
          reaction,
          quotedMessageId,
        } = input;

        // Handle reactions
        if (isReaction && reaction && quotedMessageId) {
          console.log("Processing reaction:", { reaction, quotedMessageId });
          const poll = activePolls.get(chatId);
          if (!poll || poll.messageId !== quotedMessageId) {
            console.log("No active poll found for message:", quotedMessageId);
            return "No active poll found for this message";
          }

          if (poll.status === "closed") {
            console.log("Poll is closed:", quotedMessageId);
            return "This poll has been closed";
          }

          if (isPollExpired(poll)) {
            console.log("Poll has expired:", quotedMessageId);
            poll.status = "closed";
            return "This poll has expired";
          }

          // Map reactions to votes
          const vote =
            reaction === "👍" ? "yes" : reaction === "👎" ? "no" : null;
          if (!vote) {
            console.log("Invalid reaction:", reaction);
            return "Invalid reaction. Please use 👍 for yes or 👎 for no";
          }

          console.log("Recording vote:", { senderId, vote });
          poll.votes.set(senderId, vote);
          return createPollMessage(poll);
        }
        
         // Handle new messages
         const pollData = parsePollCreationMessage(message);
         if (pollData) {
           console.log("Creating new poll:", pollData);
           const newPoll: PollData = {
             creator: senderId,
             reason: pollData.reason,
             amount: pollData.amount,
             votes: new Map(),
             timestamp: Date.now(),
             messageId: quotedMessageId || "",
             status: "active",
           };
 
           activePolls.set(chatId, newPoll);
           return createPollMessage(newPoll);
         }
 
         // Check existing poll status
         const existingPoll = activePolls.get(chatId);
         if (existingPoll) {
           console.log("Checking existing poll status");
           const status = getPollStatus(existingPoll);
           if (status === "expired") {
             existingPoll.status = "closed";
           }
           return createPollMessage(existingPoll);
         }                                            
 
         return "No active poll found. To create a poll, send a message requesting money (e.g., 'Need $50 for project expenses')";
       } catch (error) {
         console.error("Poll management error:", error);
         return "An error occurred while managing the poll";
       }
     },
   });
 };                                                                       
 
 // Export helper functions
 export { createPollMessage, activePolls };
 export type { PollData };
 