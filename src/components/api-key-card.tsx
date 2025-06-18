"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "~/lib/trpc/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { useForm } from "@tanstack/react-form";
import { Button } from "./ui/button";
import { Check, Eye, Save, Trash } from "lucide-react";
import { EyeOff } from "lucide-react";
import { API_PROVIDERS, type ApiProviderId } from "~/shared/api-providers";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";

export default function ApiKeyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Configure API keys for different AI providers. These keys are
          encrypted and stored securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ApiKeyForm provider="openai" />
        <Separator className="my-6" />
        <ApiKeyForm provider="google" />
      </CardContent>
    </Card>
  );
}

function ApiKeyForm({ provider }: { provider: ApiProviderId }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: existingKeys } = useQuery({
    ...trpc.apiKey.getApiKeys.queryOptions(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
  const [showKey, setShowKey] = useState(false);

  const upsertApiKeyMutation = useMutation(
    trpc.apiKey.upsertApiKey.mutationOptions({
      onMutate: async (data) => {
        const previousKey = queryClient.getQueryData(
          trpc.apiKey.getApiKeys.queryKey()
        );
        queryClient.setQueryData(
          trpc.apiKey.getApiKeys.queryKey(),
          (oldData) => {
            form.setFieldValue(provider, data.key);
            return oldData
              ? {
                  ...oldData,
                  [provider]: data.key,
                }
              : oldData;
          }
        );
        return { previousKey };
      },
      onError: (error, data, context) => {
        form.setFieldValue(provider, context?.previousKey?.[provider] || "");
        queryClient.setQueryData(
          trpc.apiKey.getApiKeys.queryKey(),
          context?.previousKey
        );
      },
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.apiKey.getApiKeys.queryKey(), (oldData) =>
          oldData
            ? {
                ...oldData,
                ...data,
              }
            : oldData
        );
      },
    })
  );

  const deleteApiKeyMutation = useMutation(
    trpc.apiKey.deleteApiKey.mutationOptions({
      onMutate: async (data) => {
        const previousKey = queryClient.getQueryData(
          trpc.apiKey.getApiKeys.queryKey()
        );
        queryClient.setQueryData(
          trpc.apiKey.getApiKeys.queryKey(),
          (oldData) => {
            form.reset();
            return oldData
              ? {
                  ...oldData,
                  [data.provider]: "",
                }
              : oldData;
          }
        );
        return { previousKey };
      },
      onError: (error, data, context) => {
        form.setFieldValue(provider, context?.previousKey?.[provider] || "");
        queryClient.setQueryData(
          trpc.apiKey.getApiKeys.queryKey(),
          context?.previousKey
        );
      },
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.apiKey.getApiKeys.queryKey(), (oldData) =>
          oldData
            ? {
                ...oldData,
                ...data,
              }
            : oldData
        );
      },
    })
  );

  const form = useForm({
    defaultValues: {
      [provider]: existingKeys?.[provider] || "",
    } as Record<ApiProviderId, string>,
    onSubmit: async ({ value }) => {
      await upsertApiKeyMutation.mutateAsync({
        provider,
        key: value[provider],
      });
    },
  });

  return (
    <form.Field
      name={provider}
      children={(field) => (
        <div className="space-y-4">
          <div>
            <Label
              htmlFor={field.name}
              className="text-base font-medium flex justify-between"
            >
              {API_PROVIDERS[provider].name}
              <Button
                variant="ghost"
                size="icon"
                className="hover:text-destructive"
                onClick={() => deleteApiKeyMutation.mutate({ provider })}
              >
                <Trash className="h-6 w-6" />
              </Button>
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {API_PROVIDERS[provider].description}
            </p>
          </div>
          <div className="relative">
            {existingKeys?.[provider] ? (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <p className="text-sm text-muted-foreground">API key saved</p>
              </div>
            ) : (
              <>
                <Input
                  id={field.name}
                  type={showKey ? "text" : "password"}
                  placeholder={API_PROVIDERS[provider].keyPlaceholder}
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
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Supported Models:</p>
            <div className="flex justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-2">
                {API_PROVIDERS[provider].models.map((model) => (
                  <Badge
                    key={model.id}
                    variant="secondary"
                    className="text-xs max-h-6"
                  >
                    {model.label}
                  </Badge>
                ))}
              </div>
              <Button
                onClick={() => form.handleSubmit()}
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
          </div>
        </div>
      )}
    />
  );
}
