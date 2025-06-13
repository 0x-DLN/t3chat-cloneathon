import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "~/lib/auth/server";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Card, CardContent } from "~/components/ui/card";
import { redirect } from "next/navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Middleware ensures we have a session, but let's be safe
  if (!session) {
    redirect("/auth");
  }

  const user = session.user;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        {/* Header with back button */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/" className="flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          <h1 className="text-3xl font-bold">Settings</h1>
        </div>

        {/* User Info Card */}
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
                <p className="text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings Content */}
        {children}
      </div>
    </div>
  );
}
