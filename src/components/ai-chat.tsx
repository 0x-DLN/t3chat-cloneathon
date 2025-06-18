"use client";

import { Authenticated } from "convex/react";
import { BlockList } from "./block-list";
import ChatControls from "./chat-controls";

export default function AiChat({ conversationId }: { conversationId: string }) {
  return (
    <div className="relative h-full">
      <Authenticated>
        <BlockList conversationId={conversationId} />
        <ChatControls conversationId={conversationId} />
      </Authenticated>
    </div>
  );
}
