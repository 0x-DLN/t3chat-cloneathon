"use client";

import { Authenticated } from "convex/react";
import { BlockList } from "./block-list";
import { Button } from "./ui/button";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/lib/trpc/react";

export default function AiChat({ conversationId }: { conversationId: string }) {
  const trpc = useTRPC();

  const sendMessage = useMutation(
    trpc.chat.sendBlockMessage.mutationOptions({
      onSuccess: () => {},
    })
  );

  return (
    <div className="relative h-full">
      <Authenticated>
        <BlockList conversationId={conversationId} />
      </Authenticated>
      <div className="absolute bottom-10 w-full flex items-center justify-center">
        <div className="flex items-center justify-center gap-2 w-full max-w-2xl">
          <Button
            onClick={() =>
              sendMessage.mutate({
                model: "gemini-2.0-flash",
                provider: "google",
                conversationId,
              })
            }
          >
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
