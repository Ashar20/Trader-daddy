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

  