"use client";

import { Authenticated } from "convex/react";
import { BlockList } from "./block-list";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/lib/trpc/react";

export default function AiChat({ conversationId }: { conversationId: string }) {
  const trpc = useTRPC();
  const [message, setMessage] = useState("");

  const sendMessage = useMutation(
    trpc.chat.sendBlockMessage.mutationOptions({
      onSuccess: () => {
        setMessage("");
      },
    })
  );

  return (
    <div className="relative h-full">
      <Authenticated>
        <BlockList conversationId={conversationId} />
      </Authenticated>
      <div className="absolute bottom-10 w-full flex items-center justify-center">
        <div className="flex items-center gap-2 w-full max-w-2xl">
          {/* TODO: input in its own component so it doesn't cause blocks to rerender */}
          <Input
            className="w-full"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            onClick={() =>
              sendMessage.mutate({
                model: "gemini-2.0-flash",
                provider: "google",
                conversationId,
              })
            }
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
