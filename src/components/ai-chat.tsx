"use client";

import { Authenticated, useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { EditableBlock } from "./editable-block";
import { Button } from "./ui/button";

export function BlockList({ conversationId }: { conversationId: string }) {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<Id<"blocks">>>(
    new Set()
  );

  const blocks = useQuery(api.blocks.getBlocksUser, {
    conversationId: conversationId as Id<"conversations">,
  });

  const createBlock = useMutation(api.blocks.createUserBlock);

  const handleSelectBlock = useCallback((blockId: Id<"blocks">) => {
    setSelectedBlockIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      return newSet;
    });
  }, []);

  const handleInsertBlock = useCallback(
    (prevOrder?: number, nextOrder?: number) => {
      createBlock({
        conversationId: conversationId as Id<"conversations">,
        author: "user",
        prevOrder,
        nextOrder,
      });
    },
    [conversationId, createBlock]
  );

  if (!blocks) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex-1 flex flex-col max-h-screen overflow-hidden">
      {/* Header with token counter */}
      <div className="border-b p-4 bg-background">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Living Document</h1>
          {/* <TokenCounter blocks={blocks} /> */}
          <span className="text-sm text-muted-foreground">
            token estimate: 100
          </span>
        </div>
      </div>

      {/* Scrollable blocks area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-2">
          {blocks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                Your living document is empty
              </p>
              <Button onClick={() => handleInsertBlock()}>
                Add First Block
              </Button>
            </div>
          ) : (
            blocks.map((block) => (
              <EditableBlock
                key={block._id}
                block={block}
                isSelected={selectedBlockIds.has(block._id)}
                onSelect={handleSelectBlock}
                onInsertBefore={(order) => handleInsertBlock(undefined, order)}
                onInsertAfter={(order) => handleInsertBlock(order)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function AiChat({ conversationId }: { conversationId: string }) {
  return (
    <Authenticated>
      <BlockList conversationId={conversationId} />
    </Authenticated>
  );
}
