import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useMutation } from "convex/react";
import { api } from "~/convex/_generated/api";
import type { Doc, Id } from "~/convex/_generated/dataModel";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Eye, EyeOff, Plus, Trash, MoreHorizontal } from "lucide-react";
import { Checkbox } from "./ui/checkbox";

type EditableBlockProps = {
  block: Doc<"blocks">;
  isSelected: boolean;
  onSelect: (id: Id<"blocks">) => void;
  onInsertBefore: (order: number) => void;
  onInsertAfter: (order: number) => void;
  onDeleteBlock: (blockId: Id<"blocks">, key: "Backspace" | "Delete") => void;
  onArrowNavigation?: (
    currentBlockId: Id<"blocks">,
    direction: "up" | "down" | "left" | "right",
    currentPosition?: number,
    visualOffset?: number
  ) => boolean;
  registerRef: (
    blockId: Id<"blocks">,
    ref: {
      focus: (position?: "start" | "end") => void;
      focusAtVisualOffset: (offset: number) => void;
    } | null
  ) => void;
};

export const EditableBlock = forwardRef<
  {
    focus: (position?: "start" | "end") => void;
    focusAtVisualOffset: (offset: number) => void;
  },
  EditableBlockProps
>(
  (
    {
      block,
      isSelected,
      onSelect,
      onInsertBefore,
      onInsertAfter,
      onDeleteBlock,
      onArrowNavigation,
      registerRef,
    },
    ref
  ) => {
    console.count("Render EditableBlock");
    const [isEditing, setIsEditing] = useState(false);
    const updateBlock = useMutation(api.blocks.updateBlockUser);
    const deleteBlock = useMutation(
      api.blocks.deleteBlock
    ).withOptimisticUpdate((localstore, args) => {
      const blocks = localstore.getQuery(api.blocks.getBlocksUser, {
        conversationId: block.conversationId,
      });
      const newBlocks = blocks?.filter((block) => block._id !== args.blockId);
      localstore.setQuery(
        api.blocks.getBlocksUser,
        {
          conversationId: block.conversationId,
        },
        newBlocks
      );
    });
    const toggleExclude = useMutation(api.blocks.toggleExclusion);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Helper function to calculate visual offset of cursor position
    const getVisualOffset = useCallback(
      (editorInstance: Editor, position: number): number => {
        if (!editorInstance.view.dom) return 0;

        try {
          const coords = editorInstance.view.coordsAtPos(position);
          const editorRect = editorInstance.view.dom.getBoundingClientRect();

          // Return the relative X position within the editor
          return coords.left - editorRect.left;
        } catch {
          return 0;
        }
      },
      []
    );

    // Helper function to find position from visual offset
    const getPositionFromVisualOffset = useCallback(
      (editorInstance: Editor, targetOffset: number): number => {
        if (!editorInstance.view.dom) return 0;

        try {
          const editorRect = editorInstance.view.dom.getBoundingClientRect();
          const targetX = editorRect.left + targetOffset;

          // Use ProseMirror's posAtCoords to find the position at the target coordinates
          const result = editorInstance.view.posAtCoords({
            left: targetX,
            top: editorRect.top + 10,
          });
          return result?.pos || 0;
        } catch {
          return 0;
        }
      },
      []
    );

    const editor = useEditor(
      {
        extensions: [
          StarterKit,
          Placeholder.configure({
            placeholder:
              block.author === "user" ? "Type something..." : "AI thinking...",
          }),
        ],
        content: block.content,
        injectCSS: false,
        editorProps: {
          attributes: {
            class:
              "prose prose-sm max-w-none focus:outline-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground flex-1 flex-items-center w-full",
          },
          handleKeyDown: (view, event) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Handle Enter key - create new block
            if (event.key === "Enter" && !event.shiftKey) {
              // Check if we're at the end of the block
              if ($from.pos === state.doc.content.size - 1) {
                event.preventDefault();
                onInsertAfter(block.order);
                return true;
              }
            }

            // Handle Backspace and Delete on empty blocks
            if (event.key === "Backspace" || event.key === "Delete") {
              const isEmpty = state.doc.textContent.trim() === "";

              if (isEmpty) {
                event.preventDefault();
                onDeleteBlock(block._id, event.key);
                deleteBlock({ blockId: block._id });
                return true;
              }
            }

            // Handle Arrow key navigation between blocks
            if (
              onArrowNavigation &&
              editor &&
              ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                event.key
              )
            ) {
              const currentPos = $from.pos;
              const docStart = 1;
              const docEnd = state.doc.content.size - 1;

              switch (event.key) {
                case "ArrowUp":
                  // Always navigate to previous block
                  event.preventDefault();
                  const visualOffsetUp = getVisualOffset(editor, currentPos);
                  return onArrowNavigation(
                    block._id,
                    "up",
                    currentPos,
                    visualOffsetUp
                  );

                case "ArrowDown":
                  // Always navigate to next block
                  event.preventDefault();
                  const visualOffsetDown = getVisualOffset(editor, currentPos);
                  return onArrowNavigation(
                    block._id,
                    "down",
                    currentPos,
                    visualOffsetDown
                  );

                case "ArrowLeft":
                  // If we're at the very beginning, navigate to previous block
                  if (currentPos <= docStart) {
                    event.preventDefault();
                    return onArrowNavigation(block._id, "left", currentPos);
                  }
                  break;

                case "ArrowRight":
                  // If we're at the very end, navigate to next block
                  if (currentPos >= docEnd) {
                    event.preventDefault();
                    return onArrowNavigation(block._id, "right", currentPos);
                  }
                  break;
              }
            }

            return false;
          },
        },
        onUpdate: () => {
          if (isEditing) {
            setHasUnsavedChanges(true);
          }
        },
        onFocus: () => setIsEditing(true),
        onBlur: ({ editor }: { editor: Editor }) => {
          setIsEditing(false);
          if (hasUnsavedChanges) {
            updateBlock({
              blockId: block._id,
              content: editor.getJSON(),
            });
            setHasUnsavedChanges(false);
          }
        },
        immediatelyRender: false,
        shouldRerenderOnTransaction: false,
      },
      [block.isStreaming]
    );

    // Expose focus methods to parent
    useImperativeHandle(
      ref,
      () => ({
        focus: (position: "start" | "end" = "start") => {
          if (editor) {
            if (position === "start") {
              editor.commands.focus("start");
            } else {
              editor.commands.focus("end");
            }
          }
        },
        focusAtVisualOffset: (targetOffset: number) => {
          if (editor) {
            const targetPos = getPositionFromVisualOffset(editor, targetOffset);
            editor.commands.focus(targetPos);
          }
        },
      }),
      [editor, getPositionFromVisualOffset]
    );

    // Register this block's ref with the parent
    useEffect(() => {
      const blockRef = {
        focus: (position: "start" | "end" = "start") => {
          if (editor) {
            if (position === "start") {
              editor.commands.focus("start");
            } else {
              editor.commands.focus("end");
            }
          }
        },
        focusAtVisualOffset: (targetOffset: number) => {
          if (editor) {
            const targetPos = getPositionFromVisualOffset(editor, targetOffset);
            editor.commands.focus(targetPos);
          }
        },
      };

      registerRef(block._id, blockRef);

      return () => {
        registerRef(block._id, null);
      };
    }, [block._id, editor, registerRef, getPositionFromVisualOffset]);

    const handleToggleExclusion = useCallback(() => {
      toggleExclude({ blockId: block._id, isExcluded: !block.isExcluded });
    }, [block.isExcluded, block._id, toggleExclude]);

    if (block.isStreaming && block.streamingContent) {
      return (
        <div className="group relative px-6 py-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mt-1 shrink-0">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="prose prose-sm max-w-none text-foreground">
                {block.streamingContent}
                <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "group relative transition-all duration-200",
          isSelected && "bg-blue-50/50",
          block.isExcluded && "opacity-50"
        )}
      >
        {/* Main content area */}
        <div className="flex items-start gap-3 px-6">
          {/* Insert button (left side) */}
          <div className="w-6 h-6 flex items-center justify-center mt-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onInsertBefore(block.order)}
              className="h-6 w-6 p-0 hover:bg-accent transition-opacity duration-200 opacity-0 group-hover:opacity-100"
              title="Insert block before"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          {/* Content */}
          <EditorContent
            className="flex-1 flex items-center p-1"
            editor={editor}
          />

          {/* Controls */}
          <div className="flex items-center gap-1 transition-opacity duration-200 ml-2 opacity-0 group-hover:opacity-100">
            <div
              className="h-7 w-7 p-0 hover:bg-accent flex items-center justify-center rounded-md"
              title="Select block"
              onClick={() => onSelect(block._id)}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => {}}
                className="pointer-events-none"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExclusion}
              className="h-7 w-7 p-0 hover:bg-accent"
              title={
                block.isExcluded ? "Include in context" : "Exclude from context"
              }
            >
              {block.isExcluded ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDeleteBlock(block._id, "Delete");
                deleteBlock({ blockId: block._id });
              }}
              className="h-7 w-7 p-0 hover:bg-destructive hover:text-destructive-foreground"
              title="Delete block"
            >
              <Trash className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-accent opacity-60"
              title="More options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

EditableBlock.displayName = "EditableBlock";
