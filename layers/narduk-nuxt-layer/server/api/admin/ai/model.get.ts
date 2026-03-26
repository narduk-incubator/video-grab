import { requireAdmin } from '../../../utils/auth'
import { kvGet } from '../../../utils/kv'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  // Try to load the currently configured chat model from D1 cache / KV cache
  const configModel = await kvGet<{ value: string }>(event, 'admin:chatModel')

  // We don't fetch from xAI immediately to avoid latency unless explicitly requested
  return {
    currentModel: configModel?.value || 'grok-3-mini',
    // The front-end can fetch actual available models if XAI_API_KEY is configured
  }
})
