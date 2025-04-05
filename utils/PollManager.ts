import { Client, Message } from "whatsapp-web.js";
import { Poll, PollMessage, PollReaction, PollVote } from "./types";
import {
  createPollMessage,
  updatePollMessage,
  extractAmount,
  isMatchingMessageId,
} from "./PollUtils";

export class PollManager {
  private activePolls: Map<string, Poll>;
  private client: Client;

  constructor(client: Client) {
    this.activePolls = new Map();
    this.client = client;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Handle message reactions
    this.client.on("message_reaction", this.handleReaction.bind(this));

    // Handle alternative reaction format
    this.client.on(
      "messages.reaction",
      this.handleAlternativeReaction.bind(this)
    );

    // Handle native poll votes
    this.client.on("poll_vote", this.handlePollVote.bind(this));
  }

  public async handleMoneyRequest(msg: Message, userName: string) {
    try {
      const chat = msg.body.toLowerCase();
      const amount = extractAmount(chat) || 10;

      // Extract reason after "for" or "because"
      let reason = "unspecified reasons";
      const forMatch = chat.match(/for\s+(.*?)(\.|$|\?)/i);
      const becauseMatch = chat.match(/because\s+(.*?)(\.|$|\?)/i);

      if (forMatch && forMatch[1]) {
        reason = forMatch[1].trim();
      } else if (becauseMatch && becauseMatch[1]) {
        reason = becauseMatch[1].trim();
      }

      // Try to create a native poll first
      if (typeof (this.client as any).sendPoll === "function") {
        try {
          const pollTitle = `${userName} is asking for $${amount} for ${reason}`;
          const pollOptions = ["Yes, I'll help", "No, I can't right now"];

          await (this.client as any).sendPoll(msg.from, pollTitle, pollOptions);
          return;
        } catch (pollError) {
          console.error("Error creating native poll:", pollError);
        }
      }

      // Fallback to reaction-based poll
      const poll = {
        creator: userName,
        reason,
        amount,
        votes: new Map<string, "yes" | "no">(),
        timestamp: Date.now(),
        messageId: "",
      };

      const pollMessage = await msg.reply(
        createPollMessage(poll.creator, poll.reason, poll.amount)
      );

      if (pollMessage && pollMessage.id) {
        if (typeof pollMessage.id === "string") {
          poll.messageId = pollMessage.id;
        } else if (
          pollMessage.id &&
          typeof pollMessage.id === "object" &&
          "_serialized" in pollMessage.id
        ) {
          poll.messageId = pollMessage.id._serialized;
        } else {
          poll.messageId = JSON.stringify(pollMessage.id);
        }

        this.activePolls.set(msg.from, poll);


        // Set poll expiration
        setTimeout(() => {
          if (this.activePolls.has(msg.from)) {
            const expiredPoll = this.activePolls.get(msg.from);
            if (expiredPoll && expiredPoll.timestamp === poll.timestamp) {
              this.activePolls.delete(msg.from);

              let yesVotes = 0;
              let noVotes = 0;
              poll.votes.forEach((vote) => {
                if (vote === "yes") yesVotes++;
                else if (vote === "no") noVotes++;
              });

              this.client
                .sendMessage(
                  msg.from,
                  `📊 *POLL RESULTS* 📊\n` +
                    `The money request poll by ${poll.creator} has ended.\n` +
                    `Final votes: ${yesVotes} yes, ${noVotes} no`
                )
                .catch((err) =>
                  console.error("Error sending poll results:", err)
                );
            }
          }
        }, 86400000); // 24 hours
      }
    } catch (error) {
      console.error("Error handling money request:", error);
      await msg.reply(
        "I couldn't create the poll right now. Please try again later!"
      );
    }
  }

  private async handleReaction(reaction: PollReaction) {
    try {
      if (!this.client || typeof this.client.sendMessage !== "function") return;

      const chatId = reaction.msgId.remote;

      if (!this.activePolls.has(chatId)) {
        return;
      }

      const poll = this.activePolls.get(chatId);
      if (!poll) return;

      if (!isMatchingMessageId(reaction.msgId.id, poll.messageId)) {
        return;
      }

      const contact = await this.client.getContactById(reaction.senderId);
      let contactId = "";

      if (typeof contact.id === "string") {
        contactId = contact.id;
      } else if (
        contact.id &&
        typeof contact.id === "object" &&
        "_serialized" in contact.id
      ) {
        contactId = contact.id._serialized;
      }

      if (!contactId) return;

      if (reaction.reaction === "👍") {
        poll.votes.set(contactId, "yes");
      } else if (reaction.reaction === "👎") {
        poll.votes.set(contactId, "no");
      }

      const updated = updatePollMessage(poll);
      await this.client.sendMessage(chatId, updated);
    } catch (error) {
      console.error("Error handling reaction:", error);
    }
  }

  private async handleAlternativeReaction(reactions: any) {
    try {
      if (!this.client || typeof this.client.sendMessage !== "function") return;

      const reactionsArray = Array.isArray(reactions) ? reactions : [reactions];

      for (const reaction of reactionsArray) {
        const key = reaction.key || reaction.msgKey || {};
        const chatId = key.remoteJid || key.remote || reaction.chatId;

        if (!chatId || !this.activePolls.has(chatId)) continue;

        const poll = this.activePolls.get(chatId);
        if (!poll) continue;

        const reactedMessageId =
          key.id ||
          (reaction.key && reaction.key.id) ||
          (reaction.msgKey && reaction.msgKey.id);

        if (!isMatchingMessageId(reactedMessageId, poll.messageId)) continue;

        const emoji = reaction.text || reaction.type || reaction.reaction;
        const voterId =
          reaction.senderId || reaction.senderJid || reaction.participant;

        if (!emoji || !voterId) continue;

        if (emoji === "👍") {
          poll.votes.set(voterId, "yes");
        } else if (emoji === "👎") {
          poll.votes.set(voterId, "no");
        }

        const updated = updatePollMessage(poll);
        await this.client.sendMessage(chatId, updated);
      }
    } catch (error) {
      console.error("Error handling alternative reaction:", error);
    }
  }

  private async handlePollVote(vote: PollVote) {
    try {
      if (!this.client || typeof this.client.sendMessage !== "function") return;

      if (vote && vote.voter && vote.selectedOptions) {
        const voter = vote.voter;
        const selectedOptions = vote.selectedOptions || [];
        const parentMessage = vote.parentMessage;

        if (!parentMessage || !parentMessage.from) return;

        const chatId = parentMessage.from;

        let voterName = "Someone";
        try {
          const contact = await this.client.getContactById(voter);
          voterName = contact.pushname || contact.name || "Someone";
        } catch (error) {
          console.log("Error getting voter contact:", error);
        }

        const optionsList = selectedOptions
          .map((option: any) =>
            typeof option === "string"
              ? option
              : option.name ||
                (option.id ? `Option ${option.id}` : "Unknown option")
          )
          .join(", ");

        if (optionsList && optionsList.length > 0) {
          await this.client.sendMessage(
            chatId,
            `📊 *Poll Update* 📊\n${voterName} voted for: ${optionsList}`
          );
        }
      }
    } catch (error) {
      console.error("Error handling poll vote:", error);
    }
  }
}
