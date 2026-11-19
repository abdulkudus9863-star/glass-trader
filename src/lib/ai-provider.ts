export type AiProvider = "local" | "openai" | "gemini";

export const AI_PROVIDER_KEY = "gt.aiProvider";
export const DEFAULT_AI_PROVIDER: AiProvider = "local";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  local: "Local Engine",
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
};

export function isAiProvider(value: unknown): value is AiProvider {
  return value === "local" || value === "openai" || value === "gemini";
}

/** Read the preferred engine. Local is the safe default. */
export function loadAiProvider(): AiProvider {
  try {
    const raw = localStorage.getItem(AI_PROVIDER_KEY);
    return isAiProvider(raw) ? raw : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export function saveAiProvider(provider: AiProvider): void {
  try {
    localStorage.setItem(AI_PROVIDER_KEY, provider);
  } catch {
    /* storage unavailable — keep in-memory preference only */
  }
}

/**
 * Honest engine label. The local engine is deterministic and runs on-device —
 * it is never presented as a hosted model.
 */
export function engineLabel(
  provider: AiProvider,
  model?: string | null,
): string {
  if (provider === "local") return "LOCAL ENGINE";
  return model ? model.toUpperCase() : provider.toUpperCase();
}
