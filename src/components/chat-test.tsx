"use client";

import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "~/lib/trpc/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "~/lib/utils";

export default function ChatTest({
  conversationId,
}: {
  conversationId?: string | undefined;
}) {
  const trpc = useTRPC();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useMutation(
    trpc.chat.sendMessage.mutationOptions({
      onSuccess(data) {
        router.push(`/chat/${data.conversationId}`);
        setMessage("");
        // Reset textarea height after clearing message
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      },
    })
  );

  // Auto-resize textarea
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Reset height to auto to get the correct scrollHeight
    e.target.style.height = "auto";
    // Set height based on scrollHeight, but respect max-height
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`; // 80px = max-h-20 (5 lines * 16px line-height)
  };

  const handleSend = () => {
    if (!message.trim()) return;

    sendMessage.mutate({
      conversationId,
      message: message,
      model: "gemini-2.0-flash",
      provider: "google",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      <Authenticated>
        {conversationId ? (
          <ChatMessages conversationId={conversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No conversation ID
          </div>
        )}
      </Authenticated>
      <Unauthenticated>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Please login to continue
        </div>
      </Unauthenticated>

      {/* Fixed input area at bottom */}
      <div className="border-t bg-background p-4 flex-shrink-0">
        <div className="flex gap-2 max-w-4xl mx-auto items-end">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="flex-1 min-h-[40px] max-h-20 resize-none overflow-y-auto"
            disabled={sendMessage.isPending}
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={sendMessage.isPending || !message.trim()}
            className="flex-shrink-0"
          >
            {sendMessage.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatMessages({ conversationId }: { conversationId: string }) {
  const messages = useQuery(api.conversations.getConversationWithMessages, {
    conversationId: conversationId as Id<"conversations">,
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current && messages?.messages) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }, 0);
      }
    }
  }, [messages?.messages]); // Only trigger when message count changes

  if (!messages) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading messages...
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
      <div className="max-w-4xl mx-auto p-4 space-y-4 min-h-full">
        {messages.messages.length === 0 ? (
          <div className="flex items-center justify-center min-h-full text-muted-foreground">
            Start a conversation by sending a message below
          </div>
        ) : (
          messages.messages.map((message, index) => (
            <MessageBubble
              key={index}
              content={message.content}
              isUser={message.role === "user"}
            />
          ))
        )}
      </div>
    </ScrollArea>
  );
}

function MessageBubble({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) {
  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground ml-12"
            : "bg-muted text-foreground mr-12"
        )}
      >
        {content}
      </div>
    </div>
  );
}
