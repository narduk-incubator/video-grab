import type { ComputedRef, Ref } from 'vue'

export interface AdminSystemPrompt {
  name: string
  content: string
  description: string
  updatedAt: string
}

interface ModelResponse {
  currentModel: string
}

interface UpdateResponse {
  ok: boolean
}

export function useAdminAi() {
  const toast = useToast()

  // ─── Current Model Tracking ─────────────────────────────────
  const { data: modelData, refresh: refreshModel } = useAsyncData('layer-admin-ai-model', () =>
    $fetch<ModelResponse>('/api/admin/ai/model'),
  )

  const currentModel = computed(() => modelData.value?.currentModel || 'grok-3-mini')
  const isUpdatingModel = ref(false)

  async function updateActiveModel(newModel: string) {
    if (!newModel) return
    isUpdatingModel.value = true
    try {
      await $fetch<UpdateResponse>('/api/admin/ai/model', {
        method: 'PUT',
        body: { model: newModel },
      })
      toast.add({ title: 'AI Model updated', color: 'success' })
      await refreshModel()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.add({
        title: 'Failed to update AI model',
        description: message,
        color: 'error',
      })
    } finally {
      isUpdatingModel.value = false
    }
  }

  // ─── System Prompts ─────────────────────────────────────────
  const {
    data: systemPrompts,
    refresh: refreshPrompts,
    status: promptsStatus,
  } = useAsyncData<AdminSystemPrompt[]>('layer-admin-system-prompts', () =>
    $fetch<AdminSystemPrompt[]>('/api/admin/system-prompts'),
  )

  const isUpdatingPrompt = ref<string | null>(null)

  async function updateSystemPrompt(name: string, content: string) {
    if (!name || !content) return
    isUpdatingPrompt.value = name
    try {
      await $fetch<UpdateResponse>('/api/admin/system-prompts', {
        method: 'PUT',
        body: { name, content },
      })
      toast.add({ title: `Prompt updated`, description: name, color: 'success' })
      await refreshPrompts()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.add({
        title: 'Failed to update prompt',
        description: message,
        color: 'error',
      })
    } finally {
      if (isUpdatingPrompt.value === name) {
        isUpdatingPrompt.value = null
      }
    }
  }

  return {
    currentModel: currentModel as ComputedRef<string>,
    isUpdatingModel: isUpdatingModel as Ref<boolean>,
    updateActiveModel,
    systemPrompts: systemPrompts as unknown as Ref<AdminSystemPrompt[] | null>,
    promptsStatus: promptsStatus as unknown as Ref<string>,
    isUpdatingPrompt: isUpdatingPrompt as Ref<string | null>,
    updateSystemPrompt,
  }
}
