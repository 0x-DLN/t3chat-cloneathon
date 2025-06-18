import ApiKeyCard from "~/components/api-key-card";

export default function AccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Account Settings</h2>
        <p className="text-muted-foreground">Manage your API keys.</p>
      </div>

      <ApiKeyCard />
    </div>
  );
}
