import { Poll } from "./types";

// Function to create a poll message
export function createPollMessage(
  creator: string,
  reason: string,
  amount: number
): string {
  return (
    `💰 *MONEY REQUEST POLL* 💰\n\n` +
    `*${creator}* is asking for *$${amount.toFixed(2)}*\n` +
    `*Reason:* ${reason}\n\n` +
    `*TO VOTE:*\n` +
    `• React with 👍 to help with this request\n` +
    `• React with 👎 to decline\n\n` +
    `Poll expires in 24 hours. Current votes: 0 yes, 0 no`
  );
}

// Function to update poll message with current votes
export function updatePollMessage(poll: Poll): string {
  let yesVotes = 0;
  let noVotes = 0;
  let yesVoters: string[] = [];
  let noVoters: string[] = [];

  poll.votes.forEach((vote, voterId) => {
    if (vote === "yes") {
      yesVotes++;
      yesVoters.push(voterId);
    } else if (vote === "no") {
      noVotes++;
      noVoters.push(voterId);
    }
  });

  return (
    `💰 *MONEY REQUEST POLL* 💰\n\n` +
    `*${poll.creator}* is asking for *$${poll.amount.toFixed(2)}*\n` +
    `*Reason:* ${poll.reason}\n\n` +
    `*TO VOTE:*\n` +
    `• React with 👍 to help with this request\n` +
    `• React with 👎 to decline\n\n` +
    `*Current Votes:*\n` +
    `👍 Yes (${yesVotes}): ${yesVoters.join(", ") || "None"}\n` +
    `👎 No (${noVotes}): ${noVoters.join(", ") || "None"}\n\n` +
    `Poll expires in ${Math.max(
      0,
      Math.floor((poll.timestamp + 86400000 - Date.now()) / 3600000)
    )} hours.`
  );
}

// Function to extract amount from message
export function extractAmount(message: string): number | null {
  const amountRegex =
    /\$(\d+(\.\d+)?)|(\d+(\.\d+)?) dollars|(\d+(\.\d+)?)USD|(\d+(\.\d+)?) USD|(\d+(\.\d+)?) USDC/i;
  const match = message.match(amountRegex);

  if (match) {
    // Find the first non-undefined value in the match groups (amount value)
    for (let i = 1; i < match.length; i++) {
      if (match[i] !== undefined && !isNaN(parseFloat(match[i]))) {
        return parseFloat(match[i]);
      }
    }
  }

  return null;
}

// Helper function to extract the unique part of a message ID
export function extractUniqueId(id: string | any): string {
  if (typeof id === "string") {
    // Match alphanumeric chunks that are at least 8 chars long (likely the core ID)
    const matches = id.match(/[A-Z0-9]{8,}/g);
    return matches && matches.length > 0 ? matches[0] : "";
  } else if (id && typeof id === "object") {
    return typeof id.id === "string"
      ? id.id
      : id._serialized
      ? id._serialized
      : JSON.stringify(id);
  }
  return "";
}

// Helper function to check if two message IDs match even with different formats
export function isMatchingMessageId(
  id1: string | any,
  id2: string | any
): boolean {
  // Direct equality
  if (id1 === id2) return true;

  // Convert both to string format
  const str1 = typeof id1 === "string" ? id1 : JSON.stringify(id1);
  const str2 = typeof id2 === "string" ? id2 : JSON.stringify(id2);

  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) return true;

  // Extract unique parts and compare
  const unique1 = extractUniqueId(id1);
  const unique2 = extractUniqueId(id2);

  if (!unique1 || !unique2) return false;
  return Boolean(unique1.includes(unique2) || unique2.includes(unique1));
}
