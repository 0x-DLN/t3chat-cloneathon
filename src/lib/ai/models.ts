import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export function getAiModel(
  provider: "openai" | "google",
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
  }
}
