import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ApiProviderId } from "~/shared/api-providers";

export function getAiModel(
  provider: ApiProviderId,
  model: string,
  apiKey: string
) {
  switch (provider) {
    case "openai": {
      const openAiClient = createOpenAI({
        apiKey,
      });
      return openAiClient(model);
    }
    case "google": {
      const googleClient = createGoogleGenerativeAI({
        apiKey,
      });
      return googleClient(model);
    }
    case "openrouter": {
      const openrouterClient = createOpenRouter({
        apiKey,
      });
      return openrouterClient(model);
    }
  }
}
