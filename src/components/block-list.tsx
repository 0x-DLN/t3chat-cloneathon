import { useMutation, useQuery } from "convex/react";
import { useCallback, useState, useRef } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { EditableBlock } from "./editable-block";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

export function BlockList({ conversationId }: { conversationId: string }) {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<Id<"blocks">>>(
    new Set()
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const blockRefs = useRef<
    Map<
      Id<"blocks">,
      {
        focus: (position?: "start" | "end") => void;
        focusAtVisualOffset: (offset: number) => void;
        isEditorEmpty?: () => boolean;
      }
    >
  >(new Map());

  const blocks = useQuery(api.blocks.getBlocksUser, {
    conversationId: conversationId as Id<"conversations">,
  });

  const conversation = useQuery(api.conversations.getConversation, {
    conversationId: conversationId as Id<"conversations">,
  });

  const createBlock = useMutation(api.blocks.createUserBlock);
  const setTitle = useMutation(api.conversations.setTitle);

  const handleTitleClick = useCallback(() => {
    if (!editingTitle && conversation?.title && titleRef.current) {
      setEditingTitle(true);
      titleRef.current.textContent = conversation.title;
      // Focus and select all text
      setTimeout(() => {
        if (titleRef.current) {
          titleRef.current.focus();
          const range = document.createRange();
          range.selectNodeContents(titleRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 0);
    }
  }, [editingTitle, conversation?.title]);

  const handleTitleBlur = useCallback(async () => {
    if (editingTitle && titleRef.current) {
      const newTitle = titleRef.current.textContent?.trim() || "";
      if (newTitle && newTitle !== conversation?.title) {
        try {
          await setTitle({
            conversationId: conversationId as Id<"conversations">,
            title: newTitle,
          });
        } catch (error) {
          console.error("Failed to update title:", error);
          // Reset to original title on error
          if (titleRef.current) {
            titleRef.current.textContent = conversation?.title || "";
          }
        }
      }
    }
    setEditingTitle(false);
  }, [editingTitle, conversation?.title, conversationId, setTitle]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        if (titleRef.current) {
          titleRef.current.textContent = conversation?.title || "";
        }
        setEditingTitle(false);
      }
    },
    [conversation?.title]
  );

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
    async (afterOrder?: number, shouldFocus: boolean = true) => {
      const newBlockId = await createBlock({
        conversationId: conversationId as Id<"conversations">,
        author: "user",
        afterOrder,
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

  const handleNavigateBlock = useCallback(
    (
      blockId: Id<"blocks">,
      direction: "up" | "down" | "left" | "right",
      visualOffset?: number
    ) => {
      if (!blocks) return;

      const blockIndex = blocks.findIndex((block) => block._id === blockId);
      if (blockIndex === -1) return;

      let targetBlockId: Id<"blocks"> | null = null;
      let position: "start" | "end" = "start";

      if (direction === "up" && blockIndex > 0) {
        targetBlockId = blocks[blockIndex - 1]._id;
        position = "end";
      } else if (direction === "down" && blockIndex < blocks.length - 1) {
        targetBlockId = blocks[blockIndex + 1]._id;
        position = "start";
      } else if (direction === "left" && blockIndex > 0) {
        targetBlockId = blocks[blockIndex - 1]._id;
        position = "end";
      } else if (direction === "right" && blockIndex < blocks.length - 1) {
        targetBlockId = blocks[blockIndex + 1]._id;
        position = "start";
      }

      if (targetBlockId) {
        setTimeout(() => {
          const blockRef = blockRefs.current.get(targetBlockId!);
          if (blockRef) {
            if (
              (direction === "up" || direction === "down") &&
              visualOffset !== undefined
            ) {
              blockRef.focusAtVisualOffset(visualOffset);
            } else {
              blockRef.focus(position);
            }
          }
        }, 0);
      }
    },
    [blocks]
  );

  const registerBlockRef = useCallback(
    (
      blockId: Id<"blocks">,
      ref: {
        focus: (position?: "start" | "end") => void;
        focusAtVisualOffset: (offset: number) => void;
        isEditorEmpty?: () => boolean;
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

  const handleClickBelowBlocks = useCallback(() => {
    if (!blocks || blocks.length === 0) {
      // No blocks, create the first one
      handleInsertBlock(undefined);
      return;
    }

    const lastBlock = blocks[blocks.length - 1];
    const lastBlockRef = blockRefs.current.get(lastBlock._id);

    if (!lastBlockRef) {
      // Can't find ref, create a new block as fallback
      handleInsertBlock(lastBlock.order);
      return;
    }

    // Check if the last block is empty using the editor's isEmpty property
    if (lastBlockRef.isEditorEmpty && lastBlockRef.isEditorEmpty()) {
      // Last block is empty, focus it
      lastBlockRef.focus("start");
    } else {
      // Last block has content, create a new block
      handleInsertBlock(lastBlock.order);
    }
  }, [blocks, handleInsertBlock]);

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
          <h1
            ref={titleRef}
            className="text-2xl font-semibold text-foreground cursor-text hover:bg-muted/20 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
            onClick={handleTitleClick}
            contentEditable={editingTitle}
            suppressContentEditableWarning={true}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
          >
            {conversation?.title || "Loading..."}
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
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto h-screen">
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
                  onClick={() => handleInsertBlock(undefined)}
                  className="mt-4"
                >
                  Add First Block
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 flex flex-col min-h-full">
              <div>
                {blocks.map((block) => (
                  <EditableBlock
                    key={block._id}
                    block={block}
                    isSelected={selectedBlockIds.has(block._id)}
                    onSelect={handleSelectBlock}
                    onInsertAfter={(order) => handleInsertBlock(order)}
                    onDeleteBlock={handleDeleteBlock}
                    onNavigateBlock={handleNavigateBlock}
                    registerRef={registerBlockRef}
                  />
                ))}
              </div>

              {/* Clickable area below blocks - spans remaining height */}
              <div
                className="flex-1 w-full px-6 min-h-32"
                onClick={handleClickBelowBlocks}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
