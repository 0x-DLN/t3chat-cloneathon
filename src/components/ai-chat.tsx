"use client";

import { Authenticated, useMutation, useQuery } from "convex/react";
import { useCallback, useState, useRef } from "react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { EditableBlock } from "./editable-block";
import { Button } from "./ui/button";

export function BlockList({ conversationId }: { conversationId: string }) {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<Id<"blocks">>>(
    new Set()
  );
  const blockRefs = useRef<
    Map<
      Id<"blocks">,
      {
        focus: (position?: "start" | "end") => void;
        focusAtVisualOffset: (offset: number) => void;
      }
    >
  >(new Map());

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
    async (
      prevOrder?: number,
      nextOrder?: number,
      shouldFocus: boolean = true
    ) => {
      const newBlockId = await createBlock({
        conversationId: conversationId as Id<"conversations">,
        author: "user",
        prevOrder,
        nextOrder,
      });

      if (shouldFocus && newBlockId) {
        // Focus the new block after a brief delay to ensure DOM is updated
        setTimeout(() => {
          const blockRef = blockRefs.current.get(newBlockId);
          if (blockRef) {
            blockRef.focus("start");
          }
        }, 0);
      }

      return newBlockId;
    },
    [conversationId, createBlock]
  );

  const handleDeleteBlock = useCallback(
    (blockId: Id<"blocks">, key: "Backspace" | "Delete") => {
      if (!blocks) return;

      const blockIndex = blocks.findIndex((block) => block._id === blockId);
      if (blockIndex === -1) return;

      let targetBlockId: Id<"blocks"> | null = null;
      let position: "start" | "end" = "start";

      if (key === "Backspace" && blockIndex > 0) {
        // Focus previous block at the end
        targetBlockId = blocks[blockIndex - 1]._id;
        position = "end";
      } else if (key === "Delete" && blockIndex < blocks.length - 1) {
        // Focus next block at the start
        targetBlockId = blocks[blockIndex + 1]._id;
        position = "start";
      }

      if (targetBlockId) {
        setTimeout(() => {
          const blockRef = blockRefs.current.get(targetBlockId!);
          if (blockRef) {
            blockRef.focus(position);
          }
        }, 0);
      }
    },
    [blocks]
  );

  const handleArrowNavigation = useCallback(
    (
      currentBlockId: Id<"blocks">,
      direction: "up" | "down" | "left" | "right",
      currentPosition?: number,
      visualOffset?: number
    ) => {
      if (!blocks) return false;

      const blockIndex = blocks.findIndex(
        (block) => block._id === currentBlockId
      );
      if (blockIndex === -1) return false;

      let targetBlockId: Id<"blocks"> | null = null;
      let targetPosition: "start" | "end" | number = "start";

      switch (direction) {
        case "up":
          if (blockIndex > 0) {
            targetBlockId = blocks[blockIndex - 1]._id;
            // For up/down, we'll use the visual offset to find the best position
            targetPosition = visualOffset !== undefined ? visualOffset : "end";
          }
          break;
        case "down":
          if (blockIndex < blocks.length - 1) {
            targetBlockId = blocks[blockIndex + 1]._id;
            targetPosition =
              visualOffset !== undefined ? visualOffset : "start";
          }
          break;
        case "left":
          if (blockIndex > 0) {
            targetBlockId = blocks[blockIndex - 1]._id;
            targetPosition = "end";
          }
          break;
        case "right":
          if (blockIndex < blocks.length - 1) {
            targetBlockId = blocks[blockIndex + 1]._id;
            targetPosition = "start";
          }
          break;
      }

      if (targetBlockId) {
        setTimeout(() => {
          const blockRef = blockRefs.current.get(targetBlockId!);
          if (blockRef) {
            if (typeof targetPosition === "number") {
              blockRef.focusAtVisualOffset(targetPosition);
            } else {
              blockRef.focus(targetPosition);
            }
          }
        }, 0);
        return true;
      }

      return false;
    },
    [blocks]
  );

  const registerBlockRef = useCallback(
    (
      blockId: Id<"blocks">,
      ref: {
        focus: (position?: "start" | "end") => void;
        focusAtVisualOffset: (offset: number) => void;
      } | null
    ) => {
      if (ref) {
        blockRefs.current.set(blockId, ref);
      } else {
        blockRefs.current.delete(blockId);
      }
    },
    []
  );

  if (!blocks) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-semibold text-foreground">
            Living Document
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">
              {blocks.length} blocks
            </span>
            <span className="text-xs text-muted-foreground/60">•</span>
            <span className="text-sm text-muted-foreground">~100 tokens</span>
          </div>
        </div>
      </div>

      {/* Document content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-6">
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-muted-foreground"
                  >
                    <path
                      d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-foreground">
                  Start your document
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Create your first block to begin building your living document
                </p>
                <Button
                  onClick={() => handleInsertBlock(undefined, undefined)}
                  className="mt-4"
                >
                  Add First Block
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6">
              {blocks.map((block) => (
                <EditableBlock
                  key={block._id}
                  block={block}
                  isSelected={selectedBlockIds.has(block._id)}
                  onSelect={handleSelectBlock}
                  onInsertBefore={(order) =>
                    handleInsertBlock(undefined, order)
                  }
                  onInsertAfter={(order) => handleInsertBlock(order, undefined)}
                  onDeleteBlock={handleDeleteBlock}
                  onArrowNavigation={handleArrowNavigation}
                  registerRef={registerBlockRef}
                />
              ))}
            </div>
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
