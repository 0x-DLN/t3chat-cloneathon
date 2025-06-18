"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import type { auth } from "~/lib/auth/server";
import { Authenticated } from "convex/react";
import ConversationsSidebar from "./conversations-sidebar";
import CreateChatButton from "./create-chat-button";

type User = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"];

export function AppSidebar({ user }: { user: User }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Authenticated>
          <CreateChatButton />
        </Authenticated>
      </SidebarHeader>

      <SidebarContent>
        <Authenticated>
          <ConversationsSidebar />
        </Authenticated>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="py-6">
              <Button size="icon" variant="ghost" asChild>
                <Link href="https://github.com/0x-DLN/t3chat-cloneathon">
                  <Github className="w-4 h-4" />
                  <span>View on GitHub</span>
                </Link>
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="py-6">
              <Link href="/settings" className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={user.image || ""}
                    alt={user.name || ""}
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback>
                    {user.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <p className="font-medium text-sm truncate">
                  {user.name || "Unknown User"}
                </p>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
