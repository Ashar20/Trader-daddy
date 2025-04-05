export interface Poll {
  creator: string;
  reason: string;
  amount: number;
  votes: Map<string, "yes" | "no">;
  timestamp: number;
  messageId: string;
}
export interface PollMessage {
  id: string | { _serialized: string } | any;
  from: string;
  body: string;
}

export interface PollReaction {
  msgId: {
    id: string | { _serialized: string } | any;
    remote: string;
  };
  senderId: string;
  reaction: string;
}

export interface PollVote {
  voter: string;
  selectedOptions: string[];
  parentMessage: PollMessage;
}
