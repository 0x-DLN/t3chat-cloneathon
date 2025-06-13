import { headers } from "next/headers";
import { auth } from "~/lib/auth/server";
import { SidebarProvider } from "~/components/ui/sidebar";
import { redirect } from "next/navigation";
import { AppSidebar } from "~/components/app-sidebar";
import { ConvexProviderWithBetterAuth } from "~/lib/auth/convex";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to auth if no session
  if (!session) {
    redirect("/auth");
  }

  const user = session.user;

  return (
    <ConvexProviderWithBetterAuth>
      <SidebarProvider>
        <AppSidebar user={user} />
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarProvider>
    </ConvexProviderWithBetterAuth>
  );
}
