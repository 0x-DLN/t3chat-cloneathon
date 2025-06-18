export const API_PROVIDERS = {
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "Access to GPT models and other OpenAI services",
    models: [
      { label: "GPT 4o-Mini", id: "gpt-4o-mini", contextLength: 128000 },
      { label: "GPT 4o", id: "gpt-4o", contextLength: 128000 },
      { label: "GPT 4.1", id: "gpt-4.1", contextLength: 1047576 },
      { label: "GPT 4.1 mini", id: "gpt-4.1-mini", contextLength: 1047576 },
      { label: "GPT 4.1 nano", id: "gpt-4.1-nano", contextLength: 1047576 },
    ],
    keyPlaceholder: "sk-...",
  },
  google: {
    id: "google",
    name: "Google AI",
    description: "Access to Gemini models and Google AI services",
    models: [
      {
        label: "Gemini 2.0 Flash",
        id: "gemini-2.0-flash",
        contextLength: 1048576,
      },
      {
        label: "Gemini 2.0 Flash Lite",
        id: "gemini-2.0-flash-lite",
        contextLength: 1048576,
      },
      {
        label: "Gemini 2.5 Flash",
        id: "gemini-2.5-flash",
        contextLength: 1048576,
      },
      { label: "Gemini 2.5 Pro", id: "gemini-2.5-pro", contextLength: 1048576 },
    ],
    keyPlaceholder: "AIza...",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to OpenRouter models and services",
    models: [
      {
        label: "Gemini 2.0 Flash",
        id: "google/gemini-2.0-flash-001",
        contextLength: 1048576,
      },
      {
        label: "Gemini 2.5 Flash",
        id: "google/gemini-2.5-flash",
        contextLength: 1048576,
      },
      {
        label: "Gemini 2.5 Pro",
        id: "google/gemini-2.5-pro",
        contextLength: 1048576,
      },
      {
        label: "OpenAI: GPT-4.1",
        id: "openai/gpt-4.1",
        contextLength: 1047576,
      },
      {
        label: "OpenAI: GPT-4.1 Mini",
        id: "openai/gpt-4.1-mini",
        contextLength: 1047576,
      },
      {
        label: "OpenAI: GPT-4.1 Nano",
        id: "openai/gpt-4.1-nano",
        contextLength: 1047576,
      },
    ],
    keyPlaceholder: "sk-...",
  },
} as const;

export const providers = Object.keys(API_PROVIDERS) as ApiProviderId[];

export type ApiProviderId = keyof typeof API_PROVIDERS;
export type ApiProvider = (typeof API_PROVIDERS)[ApiProviderId];
export type AnyModel = ApiProvider["models"][number];

export function getProviderForModel(model: AnyModel) {
  const provider = Object.values(API_PROVIDERS).find((provider) =>
    [...provider.models.map((m) => m.id)].includes(model.id)
  )?.id;

  if (!provider) {
    throw new Error(`No provider found for model: ${model}`);
  }

  return provider;
}

export const SYSTEM_PROMPT = `
You are an AI assistant in a chat application that functions similarly to Notion blocks or Jupyter notebooks.
Your primary goal is to provide concise, direct, and raw output, minimizing unnecessary conversational elements or excessive comments.

**Key behaviors to adhere to:**

*   **Directness:** Respond directly to the user's request without additional pleasantries or introductory/concluding remarks.
*   **Conciseness:** Provide only the essential information or code required. Avoid verbose explanations unless specifically requested.
*   **No chattiness:** Do not engage in typical conversational patterns like "Hello!", "How can I help you today?", or "Is there anything else?". Get straight to the point.
*   **Raw Output:** Present information in its most direct form. For code, this means the code block itself, not surrounded by additional text like "Here's the code you requested:".

**Multiple Response Generation:**

The user has the ability to request multiple responses in a sequence. If multiple responses are being generated,
**the final message in the sequence will be the string "<EMPTY_MESSAGE>"**.
You should not generate any content after this string when it is provided as part of the prompt.

**User Editing and Clarification:**

The user can edit your responses. This means you may encounter your own previous output with additions or modifications made by the user.
Specifically, the user may insert comments within code or text to ask for clarification on specific parts.
Respond to these in-line clarifications directly and concisely, focusing only on the point of clarification.
Do not re-explain the entire context unless necessary.
`;
