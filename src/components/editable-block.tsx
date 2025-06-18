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
import { Eye, EyeOff, Plus, Copy, Trash2 } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { convertTiptapJsonToMarkdown } from "~/lib/markdown/parser";

type EditableBlockProps = {
  block: Doc<"blocks">;
  isSelected: boolean;
  onSelect: (id: Id<"blocks">) => void;
  onInsertAfter: (order: number) => void;
  onDeleteBlock: (blockId: Id<"blocks">, key: "Backspace" | "Delete") => void;
  onNavigateBlock: (
    blockId: Id<"blocks">,
    direction: "up" | "down" | "left" | "right",
    visualOffset?: number
  ) => void;
  registerRef: (
    blockId: Id<"blocks">,
    ref: {
      focus: (position?: "start" | "end") => void;
      focusAtVisualOffset: (offset: number) => void;
      isEditorEmpty?: () => boolean;
    } | null
  ) => void;
};

export const EditableBlock = forwardRef<
  {
    focus: (position?: "start" | "end") => void;
    focusAtVisualOffset: (offset: number) => void;
    isEditorEmpty?: () => boolean;
  },
  EditableBlockProps
>(
  (
    {
      block,
      isSelected,
      onSelect,
      onInsertAfter,
      onDeleteBlock,
      onNavigateBlock,
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
              "prose prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-strong:font-semibold prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:text-foreground prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-muted-foreground flex-1 w-full",
          },
          handleKeyDown: (view, event) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Helper function to get visual offset of current cursor position
            const getCurrentVisualOffset = (): number => {
              try {
                const coords = view.coordsAtPos($from.pos);
                const editorRect = view.dom.getBoundingClientRect();
                return coords.left - editorRect.left;
              } catch {
                return 0;
              }
            };

            // Handle Arrow Up - move to previous block only if at top of textblock
            if (
              event.key === "ArrowUp" &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              // Check if we're at the visual top of the textblock
              if (view.endOfTextblock("up")) {
                event.preventDefault();
                const visualOffset = getCurrentVisualOffset();
                onNavigateBlock(block._id, "up", visualOffset);
                return true;
              }
            }

            // Handle Arrow Down - move to next block only if at bottom of textblock
            if (
              event.key === "ArrowDown" &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              // Check if we're at the visual bottom of the textblock
              if (view.endOfTextblock("down")) {
                event.preventDefault();
                const visualOffset = getCurrentVisualOffset();
                onNavigateBlock(block._id, "down", visualOffset);
                return true;
              }
            }

            // Handle Arrow Left - move to end of previous block if at start
            if (
              event.key === "ArrowLeft" &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              // Check if we're at the visual start of the textblock
              if (view.endOfTextblock("left")) {
                event.preventDefault();
                onNavigateBlock(block._id, "left");
                return true;
              }
            }

            // Handle Arrow Right - move to start of next block if at end
            if (
              event.key === "ArrowRight" &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              // Check if we're at the visual end of the textblock
              if (view.endOfTextblock("right")) {
                event.preventDefault();
                onNavigateBlock(block._id, "right");
                return true;
              }
            }

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
        isEditorEmpty: () => {
          if (editor) {
            return editor.isEmpty;
          }
          return true;
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
        isEditorEmpty: () => {
          if (editor) {
            return editor.isEmpty;
          }
          return true;
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

    const handleCopyContent = useCallback(async () => {
      if (editor) {
        try {
          // Get the JSON content from the editor and convert to markdown
          const json = editor.getJSON();
          const markdown = convertTiptapJsonToMarkdown(json);
          await navigator.clipboard.writeText(markdown);
        } catch (error) {
          console.error("Failed to copy content:", error);
        }
      }
    }, [editor]);

    const handleDeleteBlock = useCallback(() => {
      onDeleteBlock(block._id, "Delete");
      deleteBlock({ blockId: block._id });
    }, [block._id, onDeleteBlock, deleteBlock]);

    if (block.isStreaming && block.streamingContent) {
      return (
        <div className="group relative transition-all duration-200 rounded-md">
          <div className="absolute size-full border-2 border-blue-500 animate-pulse rounded-md"></div>
          {/* Main content area */}
          <div className="flex items-start gap-3 pl-6">
            {/* Insert button (left side) - hidden during streaming */}
            <div className="w-6 h-6 flex items-center justify-center mt-1 shrink-0" />

            {/* Content */}
            <div className="flex-1 flex items-center p-1">
              <div className="prose prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-strong:font-semibold prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:text-foreground prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-muted-foreground flex-1 w-full">
                {block.streamingContent}
              </div>
            </div>

            {/* Controls - hidden during streaming but maintain width */}
            <div className="flex items-center gap-1 transition-opacity duration-200 ml-2">
              {/* Invisible placeholder for selection checkbox */}
              <div className="h-7 w-7 p-0 invisible">
                <Checkbox
                  checked={false}
                  onChange={() => {}}
                  className="pointer-events-none"
                />
              </div>

              {/* Invisible placeholder for copy button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 invisible pointer-events-none"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>

              {/* Invisible placeholder for eye button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 invisible pointer-events-none"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>

              {/* Invisible placeholder for delete button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 invisible pointer-events-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
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
        <div className="flex items-start gap-3 pl-6">
          {/* Insert button (left side) */}
          <div className="w-6 h-6 flex items-center justify-center mt-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onInsertAfter(block.order)}
              className="h-6 w-6 p-0 hover:bg-accent transition-opacity duration-200 opacity-0 group-hover:opacity-100"
              title="Insert block after"
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
            {/* 1. Selection checkbox */}
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

            {/* 2. Copy button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyContent}
              className="h-7 w-7 p-0 hover:bg-accent"
              title="Copy content"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>

            {/* 3. Toggle exclusion button */}
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

            {/* 4. Delete button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteBlock}
              className="h-7 w-7 p-0 hover:text-destructive"
              title="Delete block"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

EditableBlock.displayName = "EditableBlock";
