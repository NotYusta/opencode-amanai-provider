import { Model, Plugin, Provider } from "@opencode/plugin"

/**
 * Amanai provider plugin.
 *
 * Registers the Amanai OpenAI-compatible endpoint (https://api.amanai.dev/v1)
 * and discovers the models it serves. Credentials are read from the
 * AMANAI_API_KEY environment variable. Override the endpoint with the
 * AMANAI_BASE_URL environment variable.
 */

const PROVIDER_ID = "amanai"
const DISPLAY_NAME = "Amanai"
const DEFAULT_BASE_URL = "https://api.amanai.dev/v1"
const API_KEY_ENV = "AMANAI_API_KEY"
const BASE_URL_ENV = "AMANAI_BASE_URL"

/** Fallback inventory used when live discovery is unavailable: [id, context, output, input]. */
const FALLBACK_MODELS: ReadonlyArray<readonly [string, number, number, readonly string[]]> = [
  ["glm-5.3", 1000000, 128000, ["text"]],
  ["glm-5.3-flash", 1000000, 128000, ["text", "image", "video", "file"]],
  ["glm-5.3-flashx", 1000000, 128000, ["text", "image", "video", "file"]],
  ["glm-5.2", 1000000, 128000, ["text"]],
  ["glm-5.1", 200000, 128000, ["text"]],
  ["glm-5.0-turbo", 200000, 128000, ["text"]],
  ["glm-5v-turbo", 200000, 128000, ["text", "image", "video", "file"]],
  ["muse-spark-1.1", 1048576, 1000000, ["text"]],
  ["muse-spark-1.2", 1048576, 1000000, ["text"]],
  ["qwen3.8-max", 1000000, 64000, ["text", "image", "video"]],
  ["qwen3.7-max", 1000000, 64000, ["text"]],
  ["qwen3.7-plus", 1000000, 64000, ["text", "image"]],
  ["kimi-k3", 1000000, 64000, ["text", "image", "video"]],
  ["kimi-k2.7", 256000, 32000, ["text", "image"]],
  ["kimi-k2.6", 256000, 32000, ["text", "image"]],
  ["kimi-k2.5", 256000, 32000, ["text", "image"]],
  ["deepseek-v4-pro", 1000000, 384000, ["text", "image"]],
  ["deepseek-v4-pro-0813", 1000000, 384000, ["text"]],
  ["deepseek-v4-flash", 1000000, 384000, ["text"]],
  ["deepseek-v4.1-flash", 1000000, 128000, ["text", "image"]],
  ["deepseek-v4-flash-0731", 1000000, 384000, ["text"]],
  ["minimax-m3", 1000000, 48000, ["text", "image", "video"]],
  ["minimax-m2.7", 200000, 48000, ["text", "image"]],
  ["hy3", 1000000, 64000, ["text"]],
  ["hy4", 1000000, 64000, ["text"]],
  ["grok-4.5", 500000, 64000, ["text", "image", "file"]],
  ["grok-4.6", 500000, 64000, ["text", "image", "file"]],
  ["grok-4.7", 500000, 64000, ["text", "image", "file"]],
  ["gpt-5.5", 1050000, 128000, ["text", "image", "file"]],
  ["gpt-6-astra", 1050000, 128000, ["text", "image", "video", "file"]],
  ["gpt-6-sol", 1050000, 128000, ["text", "image", "file"]],
  ["gpt-6-luna", 1050000, 128000, ["text", "image", "file"]],
  ["gpt-5.6-sol", 1050000, 128000, ["text", "image", "file"]],
  ["gpt-5.6-terra", 1050000, 128000, ["text", "image", "file"]],
  ["gpt-5.6-luna", 1050000, 128000, ["text", "image", "file"]],
  ["claude-fable-5.1", 1000000, 128000, ["text", "image", "file"]],
  ["claude-fable-5", 1000000, 128000, ["text", "image", "file"]],
  ["claude-opus-5.5", 1000000, 128000, ["text", "image", "file"]],
  ["claude-opus-5", 1000000, 128000, ["text", "image", "file"]],
  ["claude-opus-4.8", 1000000, 128000, ["text", "image", "file"]],
  ["claude-opus-4.7", 1000000, 128000, ["text", "image", "file"]],
  ["claude-opus-4.6", 1000000, 128000, ["text", "image", "file"]],
  ["claude-sonnet-5", 1000000, 128000, ["text", "image", "file"]],
  ["claude-sonnet-4.6", 1000000, 128000, ["text", "image", "file"]],
  ["claude-haiku-4.5", 200000, 64000, ["text", "image", "file"]],
  ["space-bunny-alpha", 1000000, 524288, ["text", "image", "video"]],
  ["gpt-6.1-sol", 1050000, 128000, ["text", "image", "file"]],
]

interface DiscoveredModel {
  id: string
  context_length?: number
  max_output?: number
  input_modalities?: string[]
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

function fallbackInventory(): DiscoveredModel[] {
  return FALLBACK_MODELS.map(([name, context, output, input]) => ({
    id: `amanai/${name}`,
    context_length: context,
    max_output: output,
    input_modalities: [...input],
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
  }
}

export default Plugin.define({
  id: "amanai.provider",
  async setup(ctx) {
    const providerID = Provider.ID.make(PROVIDER_ID)
    const source = { models: await discoverModels().catch(() => fallbackInventory()) }

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

    return () => clearInterval(timer)
  },
})
