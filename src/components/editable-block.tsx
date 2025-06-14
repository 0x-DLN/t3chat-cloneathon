import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useMutation } from "convex/react";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useCallback, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Eye, EyeOff, Plus } from "lucide-react";
import { Checkbox } from "./ui/checkbox";

type BlockData = {
  _id: Id<"blocks">;
  author: "user" | "assistant";
  content?: JSONContent;
  streamingContent?: string;
  isStreaming: boolean;
  isExcluded: boolean;
  order: number;
};

type EditableBlockProps = {
  block: BlockData;
  isSelected: boolean;
  onSelect: (id: Id<"blocks">) => void;
  onInsertBefore: (order: number) => void;
  onInsertAfter: (order: number) => void;
};

export function EditableBlock({
  block,
  isSelected,
  onSelect,
  onInsertBefore,
  onInsertAfter,
}: EditableBlockProps) {
  console.count("Render EditableBlock");
  const [isEditing, setIsEditing] = useState(false);
  const updateBlock = useMutation(api.blocks.updateBlockUser);
  const toggleExclude = useMutation(api.blocks.toggleExclusion);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder:
          block.author === "user" ? "Write a message..." : "Thinking...",
      }),
    ],
    content: block.content,
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
  });

  const handleToggleExclusion = useCallback(() => {
    toggleExclude({ blockId: block._id, isExcluded: !block.isExcluded });
  }, [block.isExcluded, block._id, toggleExclude]);

  if (block.isStreaming && block.streamingContent) {
    return (
      <div className="group relative p-4 my-2 border rounded-lg bg-blue-50 animate-pulse">
        <div className="prose prose-sm max-w-none">
          {block.streamingContent}
          <span className="animate-pulse">▍</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative p-4 my-2 border rounded-lg transition-all hover:border-gray-300",
        isSelected && "border-blue-500 ring-2 ring-blue-500",
        block.isExcluded && "opacity-50 bg-gray-50",
        block.author === "assistant" && "bg-slate-50"
      )}
    >
      {/* Insert buttons */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onInsertBefore(block.order)}
        className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
      >
        <Plus className="w-3 h-3" />
      </Button>

      {/* Selection checkbox */}
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(block._id)}
        />
      </div>

      {/* Exclusion toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleExclusion}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        title={block.isExcluded ? "Include in context" : "Exclude from context"}
      >
        {block.isExcluded ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </Button>

      {/* Author indicator */}
      <div className="absolute top-2 left-8 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {block.author}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none mt-2"
      />

      {/* Insert after button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onInsertAfter(block.order)}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}
