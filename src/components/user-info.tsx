"use client";

import { type auth } from "~/lib/auth/server";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Card, CardContent } from "./ui/card";
import { useState } from "react";
import { Button } from "./ui/button";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "~/lib/utils";

type User = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"];

export default function UserInfo({ user }: { user: User }) {
  const [showEmail, setShowEmail] = useState(false);

  return (
    <Card className="mb-6">
      <CardContent className="px-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage
              src={user.image || ""}
              alt={user.name || ""}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback className="text-lg">
              {user.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">
              {user.name || "Unknown User"}
            </h2>
            <div className="flex items-center gap-2">
              <p
                className={cn("text-muted-foreground", !showEmail && "blur-sm")}
              >
                {user.email}
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowEmail(!showEmail)}
              >
                {showEmail ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
