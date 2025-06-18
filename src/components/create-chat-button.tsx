"use client";
import { useMutation } from "convex/react";
import { Button } from "./ui/button";
import { api } from "@convex/_generated/api";
import { useRouter } from "next/navigation";

export default function CreateChatButton() {
  const router = useRouter();
  const createButton = useMutation(api.conversations.createConversationUser);

  const handleCreateChat = async () => {
    const conversationId = await createButton();
    router.push(`/blocks/${conversationId}`);
  };

  return (
    <Button
      className="w-full items-center justify-center"
      size="lg"
      onClick={handleCreateChat}
    >
      New Chat
    </Button>
  );
}
