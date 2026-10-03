import { Model, Plugin, Provider } from "@opencode/plugin"

/**
 * Amanai provider plugin.
 *
 * Registers the Amanai OpenAI-compatible endpoint (https://api.amanai.dev/v1)
 * and discovers the models it serves. Credentials are read from the
 * AMANAI_API_KEY environment variable. Override the endpoint with the
 * AMANAI_BASE_URL environment variable.
 *
 * Reasoning effort: Amanai advertises a `thinking` list for each model. Every
 * value other than the default becomes a model variant that sets
 * `settings.reasoningEffort`, so an effort can be selected with the `#variant`
 * selector, for example `amanai/glm-5.3#high`.
 */

const PROVIDER_ID = "amanai"
const DISPLAY_NAME = "Amanai"
const DEFAULT_BASE_URL = "https://api.amanai.dev/v1"
const API_KEY_ENV = "AMANAI_API_KEY"
const BASE_URL_ENV = "AMANAI_BASE_URL"

/** Thinking value that selects the model default, so it needs no variant. */
const DEFAULT_THINKING = "auto"

/** Retry policy for transient Amanai failures, mirroring the Command Code provider. */
const RETRY_MAX_ATTEMPTS = 5
const RETRY_BASE_DELAY_MS = 500
const RETRY_MAX_DELAY_MS = 60_000
const RETRY_JITTER = 0.2

/** Reasoning-effort sets advertised by the live Amanai model inventory. */
const EFFORTS = {
  full: ["auto", "low", "medium", "high", "xhigh", "max"],
  basic: ["auto", "low", "medium", "high"],
  withNone: ["auto", "none", "low", "medium", "high"],
  openai: ["auto", "none", "low", "medium", "high", "xhigh"],
  openaiMax: ["auto", "none", "low", "medium", "high", "xhigh", "max"],
  grok: ["auto", "low", "medium", "high", "xhigh"],
  grok45: ["auto", "minimal", "low", "medium", "high", "xhigh"],
  kimiK3: ["auto", "low", "high", "max"],
  spaceBunny: ["auto", "minimal", "low", "medium", "high", "xhigh", "max"],
  noneMax: ["auto", "none", "low", "medium", "high", "max"],
} as const

/** Fallback inventory used when live discovery is unavailable: [id, context, output, input, thinking]. */
const FALLBACK_MODELS: ReadonlyArray<
  readonly [string, number, number, readonly string[], readonly string[]]
> = [
  ["glm-5.3", 1000000, 128000, ["text"], EFFORTS.full],
  ["glm-5.3-flash", 1000000, 128000, ["text", "image", "video", "file"], EFFORTS.full],
  ["glm-5.3-flashx", 1000000, 128000, ["text", "image", "video", "file"], EFFORTS.full],
  ["glm-5.2", 1000000, 128000, ["text"], EFFORTS.full],
  ["glm-5.1", 200000, 128000, ["text"], EFFORTS.basic],
  ["glm-5.0-turbo", 200000, 128000, ["text"], EFFORTS.basic],
  ["glm-5v-turbo", 200000, 128000, ["text", "image", "video", "file"], EFFORTS.basic],
  ["muse-spark-1.1", 1048576, 1000000, ["text"], EFFORTS.openaiMax],
  ["muse-spark-1.2", 1048576, 1000000, ["text"], EFFORTS.openaiMax],
  ["qwen3.8-max", 1000000, 64000, ["text", "image", "video"], EFFORTS.withNone],
  ["qwen3.7-max", 1000000, 64000, ["text"], EFFORTS.withNone],
  ["qwen3.7-plus", 1000000, 64000, ["text", "image"], EFFORTS.withNone],
  ["kimi-k3", 1000000, 64000, ["text", "image", "video"], EFFORTS.kimiK3],
  ["kimi-k2.7", 256000, 32000, ["text", "image"], EFFORTS.basic],
  ["kimi-k2.6", 256000, 32000, ["text", "image"], EFFORTS.basic],
  ["kimi-k2.5", 256000, 32000, ["text", "image"], EFFORTS.basic],
  ["deepseek-v4-pro", 1000000, 384000, ["text", "image"], EFFORTS.basic],
  ["deepseek-v4-pro-0813", 1000000, 384000, ["text"], EFFORTS.noneMax],
  ["deepseek-v4-flash", 1000000, 384000, ["text"], EFFORTS.basic],
  ["deepseek-v4.1-flash", 1000000, 128000, ["text", "image"], EFFORTS.noneMax],
  ["deepseek-v4-flash-0731", 1000000, 384000, ["text"], EFFORTS.noneMax],
  ["minimax-m3", 1000000, 48000, ["text", "image", "video"], EFFORTS.basic],
  ["minimax-m2.7", 200000, 48000, ["text", "image"], EFFORTS.basic],
  ["hy3", 1000000, 64000, ["text"], EFFORTS.basic],
  ["hy4", 1000000, 64000, ["text"], EFFORTS.basic],
  ["grok-4.5", 500000, 64000, ["text", "image", "file"], EFFORTS.grok45],
  ["grok-4.6", 500000, 64000, ["text", "image", "file"], EFFORTS.grok],
  ["grok-4.7", 500000, 64000, ["text", "image", "file"], EFFORTS.grok],
  ["gpt-5.5", 1050000, 128000, ["text", "image", "file"], EFFORTS.openai],
  ["gpt-6-astra", 1050000, 128000, ["text", "image", "video", "file"], EFFORTS.full],
  ["gpt-6-sol", 1050000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["gpt-6-luna", 1050000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["gpt-5.6-sol", 1050000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["gpt-5.6-terra", 1050000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["gpt-5.6-luna", 1050000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["claude-fable-5.1", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-fable-5", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-opus-5.5", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-opus-5", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-opus-4.8", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-opus-4.7", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-opus-4.6", 1000000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["claude-sonnet-5", 1000000, 128000, ["text", "image", "file"], EFFORTS.full],
  ["claude-sonnet-4.6", 1000000, 128000, ["text", "image", "file"], EFFORTS.openaiMax],
  ["claude-haiku-4.5", 200000, 64000, ["text", "image", "file"], EFFORTS.full],
  ["space-bunny-alpha", 1000000, 524288, ["text", "image", "video"], EFFORTS.spaceBunny],
  ["gpt-6.1-sol", 1050000, 128000, ["text", "image", "file"], EFFORTS.full],
]

interface DiscoveredModel {
  id: string
  context_length?: number
  max_output?: number
  input_modalities?: string[]
  thinking?: string[]
}

const MEDIA_ALIASES: Record<string, string> = {
  text: "text",
  image: "image",
  audio: "audio",
  video: "video",
}

function baseURL(): string {
  return process.env[BASE_URL_ENV]?.trim() || DEFAULT_BASE_URL
}

function toInputModalities(modalities: readonly string[] | undefined): string[] {
  const mapped = new Set<string>()
  for (const modality of modalities ?? ["text"]) {
    const value = MEDIA_ALIASES[modality]
    if (value) mapped.add(value)
  }
  if (mapped.size === 0) mapped.add("text")
  return [...mapped]
}

/**
 * Retry transient failures the way the Command Code provider does: rate limits,
 * server errors, and connection failures (an error without an HTTP status) are
 * retryable, while other client errors stay terminal.
 */
function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true
  if (status === 408 || status === 425 || status === 429) return true
  return status >= 500 && status < 600
}

/** Exponential backoff with jitter, capped like the Command Code provider. */
function retryDelayMs(attempt: number): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  const jitter = exponential * RETRY_JITTER * Math.random()
  return Math.min(exponential + jitter, RETRY_MAX_DELAY_MS)
}

/**
 * Turn Amanai's advertised thinking levels into reasoning-effort variants.
 * The default level is skipped because omitting the variant already selects it.
 */
function toVariants(thinking: readonly string[] | undefined): Model.Variant[] {
  const variants: Model.Variant[] = []
  const seen = new Set<string>()
  for (const level of thinking ?? []) {
    const id = level.trim()
    if (!id || id === DEFAULT_THINKING || seen.has(id)) continue
    seen.add(id)
    variants.push({
      id: Model.VariantID.make(id),
      settings: { reasoningEffort: id },
    })
  }
  return variants
}

function fallbackInventory(): DiscoveredModel[] {
  return FALLBACK_MODELS.map(([name, context, output, input, thinking]) => ({
    id: `amanai/${name}`,
    context_length: context,
    max_output: output,
    input_modalities: [...input],
    thinking: [...thinking],
  }))
}

async function discoverModels(): Promise<DiscoveredModel[]> {
  const response = await fetch(`${baseURL()}/models`)
  if (!response.ok) {
    throw new Error(`Amanai model discovery failed with HTTP ${response.status}`)
  }
  const payload = (await response.json()) as { data?: DiscoveredModel[] }
  const models = (payload.data ?? []).filter((model) => typeof model?.id === "string")
  if (models.length === 0) {
    throw new Error("Amanai model discovery returned no models")
  }
  return models
}

function toModelInfo(providerID: Provider.ID, model: DiscoveredModel): Model.Info {
  const shortID = model.id.replace(/^amanai\//, "")
  return {
    ...Model.Info.default(providerID, Model.ID.make(shortID)),
    modelID: Model.ID.make(model.id),
    name: shortID,
    capabilities: {
      tools: true,
      input: toInputModalities(model.input_modalities),
      output: ["text"],
    },
    limit: {
      context: model.context_length ?? 131072,
      output: model.max_output ?? 32768,
    },
    variants: toVariants(model.thinking),
  }
}

export default Plugin.define({
  id: "amanai.provider",
  async setup(ctx) {
    const providerID = Provider.ID.make(PROVIDER_ID)
    const source = { models: await discoverModels().catch(() => fallbackInventory()) }

    // Retry transient Amanai failures - including ones that arrive mid-stream -
    // instead of ending the turn. The retry hook runs after OpenCode classifies
    // the failure and can make a would-be terminal error retryable.
    const retry = await ctx.session.hook(
      "retry",
      (event) => {
        if (event.attempt >= RETRY_MAX_ATTEMPTS) {
          event.decision = { retry: false }
          return
        }
        if (!isRetryableStatus(event.error.status)) return
        event.decision = { retry: true, delay: retryDelayMs(event.attempt) }
      },
      { providerID: PROVIDER_ID },
    )

    // Make the API key available through both the AMANAI_API_KEY environment
    // variable and an interactive /connect entry.
    try {
      await ctx.integration.transform((editor) => {
        editor.update(PROVIDER_ID, (integration) => {
          integration.name = DISPLAY_NAME
        })
        editor.method.update({
          integrationID: PROVIDER_ID,
          method: { type: "key", label: "API key" },
        })
        editor.method.update({
          integrationID: PROVIDER_ID,
          method: { type: "env", names: [API_KEY_ENV] },
        })
      })
    } catch (error) {
      console.error("Amanai: failed to register credential integration", error)
    }

    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: DISPLAY_NAME,
          activation: "enabled",
          integrationID: PROVIDER_ID as Provider.Info["integrationID"],
          package: "@opencode/ai/providers/openai-compatible",
          settings: {
            baseURL: baseURL(),
            apiKey: `{env:${API_KEY_ENV}}`,
          },
        },
        models: source.models.map((model) => toModelInfo(providerID, model)),
      })
    })

    // Refresh the inventory periodically without blocking startup.
    const refreshMs = 6 * 60 * 60 * 1000
    const timer = setInterval(() => {
      void discoverModels()
        .then(async (models) => {
          source.models = models
          await ctx.provider.reload()
        })
        .catch(() => {})
    }, refreshMs)

    return () => {
      clearInterval(timer)
      void retry.dispose()
    }
  },
})
