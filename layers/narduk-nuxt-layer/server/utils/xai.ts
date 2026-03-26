import { createError } from 'h3'

export interface GrokChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface XaiModel {
  id: string
  object: string
  created?: number
  owned_by?: string
}

function parseXaiError(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string }
    return parsed.error || parsed.message || null
  } catch {
    return null
  }
}

export async function grokChat(apiKey: string, messages: GrokChatMessage[], model: string) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      store: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw createError({
      statusCode: response.status,
      message: parseXaiError(body) || 'Failed to reach xAI.',
    })
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  return payload.choices?.[0]?.message?.content?.trim() || ''
}

export async function grokChatStream(
  apiKey: string,
  messages: GrokChatMessage[],
  model: string,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      store: false,
      stream: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw createError({
      statusCode: response.status,
      message: parseXaiError(body) || 'Failed to reach xAI.',
    })
  }

  return (response.body as ReadableStream<Uint8Array>).pipeThrough(createOpenAIStreamParser())
}

function createOpenAIStreamParser() {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const content = data.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encoder.encode(content))
            }
          } catch {
            // ignore invalid SSE parse errors
          }
        }
      }
    },
    flush(controller) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const data = JSON.parse(trimmed.slice(6))
          const content = data.choices?.[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(content))
          }
        } catch {
          // ignore trailing SSE parse errors
        }
      }
    },
  })
}

export async function grokListModels(apiKey: string): Promise<XaiModel[]> {
  const res = await fetch('https://api.x.ai/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[grokListModels] API error (${res.status}):`, text)
    throw createError({ statusCode: res.status, message: 'Failed to list xAI models.' })
  }

  const data = (await res.json()) as { data?: XaiModel[] }
  return data.data ?? []
}
