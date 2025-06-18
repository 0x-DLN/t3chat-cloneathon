import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import Link from "next/link";

export default function ConversationsSidebar() {
  const conversations = useQuery(api.conversations.getUserConversations);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Conversations</SidebarGroupLabel>
      <SidebarMenu>
        {conversations?.map((conversation) => (
          <SidebarMenuItem key={conversation._id}>
            <SidebarMenuButton asChild className="py-2">
              <Link href={`/blocks/${conversation._id}`}>
                <span className="truncate">{conversation.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
