export const API_PROVIDERS = {
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "Access to GPT models and other OpenAI services",
    models: [
      { label: "GPT 4o-Mini", id: "gpt-4o-mini" },
      { label: "GPT 4o", id: "gpt-4o" },
      { label: "GPT 4.1", id: "gpt-4.1" },
      { label: "GPT 4.1 mini", id: "gpt-4.1-mini" },
      { label: "GPT 4.1 nano", id: "gpt-4.1-nano" },
    ],
    keyPlaceholder: "sk-...",
  },
  google: {
    id: "google",
    name: "Google AI",
    description: "Access to Gemini models and Google AI services",
    models: [
      { label: "Gemini 2.0 Flash", id: "gemini-2.0-flash" },
      { label: "Gemini 2.0 Flash Lite", id: "gemini-2.0-flash-lite" },
      { label: "Gemini 2.5 Flash", id: "gemini-2.5-flash" },
      {
        label: "Gemini 2.5 Flash (Thinking)",
        id: "gemini-2.5-flash-thinking",
      },
      { label: "Gemini 2.5 Pro", id: "gemini-2.5-pro" },
    ],
    keyPlaceholder: "AIza...",
  },
} as const;

export type ApiProviderId = keyof typeof API_PROVIDERS;
export type ApiProvider = (typeof API_PROVIDERS)[ApiProviderId];
export type AnyModel = ApiProvider["models"][number];

export function getProviderForModel(model: AnyModel) {
  const provider = Object.values(API_PROVIDERS).find((provider) =>
    [...provider.models].includes(model)
  )?.id;

  if (!provider) {
    throw new Error(`No provider found for model: ${model}`);
  }

  return provider;
}
