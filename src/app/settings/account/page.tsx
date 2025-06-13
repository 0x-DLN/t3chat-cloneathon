"use client";

import { useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { API_PROVIDERS, type ApiProviderId } from "~/shared/api-providers";
import { useTRPC } from "~/lib/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";

export default function AccountSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: existingKeys } = useQuery({
    ...trpc.apiKey.getApiKeys.queryOptions(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
  const [showKeys, setShowKeys] = useState<Record<ApiProviderId, boolean>>({
    openai: false,
    google: false,
  });

  const apiKeysForm = useForm({
    defaultValues: {
      openai: existingKeys?.openai || "",
      google: existingKeys?.google || "",
    },
    onSubmit: async ({ value }) => {
      await upsertApiKeyMutation.mutateAsync(value);
    },
  });

  const upsertApiKeyMutation = useMutation(
    trpc.apiKey.upsertApiKeys.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.apiKey.getApiKeys.queryKey(), (oldData) =>
          oldData
            ? {
                ...oldData,
                ...data,
              }
            : oldData
        );
        toast.success(`API key saved successfully!`);
      },
      onError: (error) => {
        toast.error(`Failed to save API key: ${error.message}`);
      },
    })
  );

  const toggleKeyVisibility = (providerId: ApiProviderId) => {
    setShowKeys((prev) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Account Settings</h2>
        <p className="text-muted-foreground">
          Manage your API keys and account preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Configure API keys for different AI providers. These keys are
            encrypted and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              apiKeysForm.handleSubmit();
            }}
          >
            <apiKeysForm.Field
              name="openai"
              children={(field) => (
                <div className="space-y-4">
                  <div>
                    <Label
                      htmlFor={field.name}
                      className="text-base font-medium"
                    >
                      OpenAI
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {API_PROVIDERS.openai.description}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      id={field.name}
                      type={showKeys[field.name] ? "text" : "password"}
                      placeholder={API_PROVIDERS.openai.keyPlaceholder}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="pr-10 font-mono"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => toggleKeyVisibility(field.name)}
                    >
                      {showKeys[field.name] ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Supported Models:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {API_PROVIDERS.openai.models.map((model) => (
                        <Badge
                          key={model.id}
                          variant="secondary"
                          className="text-xs"
                        >
                          {model.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            />
            <Separator className="my-6" />
            <apiKeysForm.Field
              name="google"
              children={(field) => (
                <div className="space-y-4">
                  <div>
                    <Label
                      htmlFor={field.name}
                      className="text-base font-medium"
                    >
                      Google
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {API_PROVIDERS.google.description}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      id={field.name}
                      type={showKeys[field.name] ? "text" : "password"}
                      placeholder={API_PROVIDERS.google.keyPlaceholder}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="pr-10 font-mono"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => toggleKeyVisibility(field.name)}
                    >
                      {showKeys[field.name] ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Supported Models:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {API_PROVIDERS.google.models.map((model) => (
                        <Badge
                          key={model.id}
                          variant="secondary"
                          className="text-xs"
                        >
                          {model.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            />

            <div className="pt-4 flex justify-end">
              <Button
                onClick={() => apiKeysForm.handleSubmit()}
                disabled={upsertApiKeyMutation.isPending}
              >
                {upsertApiKeyMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save API Keys
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• API keys are encrypted and stored securely on our servers</p>
          <p>
            • Keys are only used to make requests to AI providers on your behalf
          </p>
          <p>• You can update or remove your keys at any time</p>
          <p>
            • Monitor your usage through your provider&apos;s dashboard to track
            costs
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
