import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "~/lib/auth/server";
import { Button } from "~/components/ui/button";
import { redirect } from "next/navigation";
import UserInfo from "~/components/user-info";

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
      <div className="container mx-auto py-6 px-4 max-w-5xl">
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
        <UserInfo user={user} />

        {/* Settings Content */}
        {children}
      </div>
    </div>
  );
}
