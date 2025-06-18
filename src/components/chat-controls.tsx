"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import { useTRPC } from "~/lib/trpc/react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  API_PROVIDERS,
  getProviderForModel,
  type AnyModel,
} from "~/shared/api-providers";
import { Label } from "./ui/label";
import { api } from "~/convex/_generated/api";
import { type Id } from "~/convex/_generated/dataModel";
import { convertTiptapJsonToMarkdown } from "~/lib/markdown/parser";
import { getApproximateTokens } from "~/lib/markdown/tokenizer";

// Format numbers with K abbreviation for readability
function formatTokenCount(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
}

export default function ChatControls({
  conversationId,
}: {
  conversationId: string;
}) {
  const trpc = useTRPC();

  const allModels = Object.values(API_PROVIDERS).flatMap((provider) =>
    provider.models.map((model) => ({
      ...model,
    }))
  );

  const [selectedModel, setSelectedModel] = useState<AnyModel>(allModels[0]);

  // Get blocks for token calculation
  const blocks = useQuery(api.blocks.getBlocksUser, {
    conversationId: conversationId as Id<"conversations">,
  });

  // Calculate tokens from blocks
  const tokenInfo = useMemo(() => {
    const maxTokens = selectedModel.contextLength;

    if (!blocks || blocks.length === 0) {
      return { used: 0, max: maxTokens };
    }

    // Convert all included blocks content to markdown and calculate tokens
    const totalTokens = blocks
      .filter((block) => !block.isExcluded) // Only count included blocks
      .reduce((acc: number, block) => {
        if (block.content) {
          try {
            const markdown = convertTiptapJsonToMarkdown(block.content);
            return acc + getApproximateTokens(markdown);
          } catch {
            console.error("Failed to convert block content to markdown", block);
            // Fallback to rough estimation if conversion fails
            return acc + getApproximateTokens(JSON.stringify(block.content));
          }
        }
        return acc;
      }, 0);

    return {
      used: totalTokens,
      max: maxTokens,
    };
  }, [blocks, selectedModel.contextLength]);

  const sendMessage = useMutation(trpc.chat.sendBlockMessage.mutationOptions());

  const handleModelChange = (modelId: string) => {
    const model = allModels.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel(model);
    }
  };

  const handleGenerate = () => {
    const provider = getProviderForModel(selectedModel);
    sendMessage.mutate({
      model: selectedModel.id,
      provider,
      conversationId,
    });
  };

  return (
    <div className="bg-secondary backdrop-blur-md border border-border rounded-md shadow-2xl p-4 select-none absolute bottom-0 md:mb-6 left-1/2 -translate-x-1/2 w-full md:w-auto">
      {/* Mobile Layout: Button on top, model + tokenizer below (upside down U shape) */}
      <div className="flex md:hidden gap-4 flex-col-reverse">
        {/* Generate button - full width */}
        <Button
          onClick={handleGenerate}
          disabled={sendMessage.isPending}
          className="w-full bg-blue-400/80 dark:bg-blue-600 text-primary"
        >
          {sendMessage.isPending ? "Generating..." : "Generate"}
        </Button>

        {/* Model and Tokenizer side by side */}
        <div className="flex gap-4">
          {/* Model switcher */}
          <div className="flex items-start flex-col justify-start gap-2 flex-1">
            <Label className="text-sm font-medium text-muted-foreground">
              Model
            </Label>
            <Select value={selectedModel.id} onValueChange={handleModelChange}>
              <SelectTrigger className="w-full bg-secondary backdrop-blur-sm border-border transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(API_PROVIDERS).map(([providerId, provider]) => (
                  <div key={providerId}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {provider.name}
                    </div>
                    {provider.models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className="pl-4"
                      >
                        {model.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Tokenizer */}
          <div className="flex items-start flex-col justify-start gap-2 flex-1">
            <Label className="text-sm font-medium text-muted-foreground">
              Tokens
            </Label>
            <div className="bg-secondary backdrop-blur-sm border border-border rounded-md px-3 py-2 w-full">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-foreground">
                  {formatTokenCount(tokenInfo.used)} /{" "}
                  {formatTokenCount(tokenInfo.max)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout: All three side by side */}
      <div className="hidden md:flex items-center gap-6">
        {/* Model switcher */}
        <div className="flex items-start flex-col justify-start gap-2">
          <Label className="text-sm font-medium text-muted-foreground">
            Model
          </Label>
          <Select value={selectedModel.id} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full bg-secondary backdrop-blur-sm border-border transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(API_PROVIDERS).map(([providerId, provider]) => (
                <div key={providerId}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {provider.name}
                  </div>
                  {provider.models.map((model) => (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      className="pl-4"
                    >
                      {model.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Tokenizer */}
        <div className="flex items-start flex-col justify-start gap-2">
          <Label className="text-sm font-medium text-muted-foreground">
            Tokens
          </Label>
          <div className="bg-secondary backdrop-blur-sm border border-border rounded-md px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-foreground">
                {formatTokenCount(tokenInfo.used)} /{" "}
                {formatTokenCount(tokenInfo.max)}
              </span>
            </div>
          </div>
        </div>
        {/* Generate button */}
        <div className="flex items-start flex-col justify-start gap-2">
          <Label className="text-sm font-medium text-muted-foreground invisible">
            Generate
          </Label>
          <Button
            onClick={handleGenerate}
            disabled={sendMessage.isPending}
            className="bg-blue-400/80 dark:bg-blue-600 text-primary"
          >
            {sendMessage.isPending ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
