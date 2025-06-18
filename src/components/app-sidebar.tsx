"use client";

import Link from "next/link";
import { Command, Github, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
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
import { Badge } from "./ui/badge";
import { useEffect, useRef } from "react";
import { Authenticated } from "convex/react";
import ConversationsSidebar from "./conversations-sidebar";

type User = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"];

export function AppSidebar({ user }: { user: User }) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <Sidebar>
      <SidebarHeader>
        <Button className="w-full items-center justify-center" size="lg">
          New Chat
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-10 pr-10"
            ref={searchRef}
          />
          <Badge
            variant="outline"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-none px-1 bg-accent text-accent-foreground"
          >
            <Command />K
          </Badge>
        </div>
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
