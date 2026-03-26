<script setup lang="ts">
const _props = withDefaults(
  defineProps<{
    /** List of chat models available to the active provider (e.g. xAI) */
    availableModels?: string[]
  }>(),
  {
    availableModels: () => [
      'grok-4-1-fast-non-reasoning',
      'grok-3-mini',
      'grok-4',
      'grok-4.20-beta-latest-non-reasoning',
      'grok-2-1212',
    ],
  },
)

const adminAi = useAdminAi()

// Local state for prompts to allow editing without mutating the query data directly
const editingPrompts = ref<Record<string, string>>({})

watch(
  () => adminAi.systemPrompts.value,
  (prompts) => {
    if (!prompts) return
    for (const p of prompts) {
      if (!(p.name in editingPrompts.value)) {
        editingPrompts.value[p.name] = p.content
      }
    }
  },
  { immediate: true },
)

function isPromptChanged(name: string) {
  const original = adminAi.systemPrompts.value?.find((p) => p.name === name)
  if (!original) return false
  return original.content !== editingPrompts.value[name]
}

function resetPrompt(name: string) {
  const original = adminAi.systemPrompts.value?.find((p) => p.name === name)
  if (original) {
    editingPrompts.value[name] = original.content
  }
}

const isModelUpdating = computed(() => adminAi.isUpdatingModel.value)

function formatUpdatedAt(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

function handleModelChange(event: unknown) {
  adminAi.updateActiveModel(String(event))
}

function handleSavePrompt(name: string) {
  adminAi.updateSystemPrompt(name, editingPrompts.value[name] ?? '')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Active Model Configuration -->
    <UCard class="card-base border-default">
      <div
        class="sticky top-0 z-10 flex flex-col gap-3 border-b border-default bg-default/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-default/80"
      >
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-primary">AI Settings</p>
          <h2 class="text-lg font-semibold text-default">Model Configuration</h2>
        </div>
        <p class="text-sm text-muted">
          Select the active model to be used by all application endpoints leveraging the generic AI
          engine.
        </p>
      </div>

      <div class="p-4 space-y-4">
        <!-- Feature Flags Injection Slot -->
        <slot name="feature-flags" />

        <UFormField label="Active Chat Model" class="max-w-md">
          <div class="flex gap-2">
            <USelectMenu
              :model-value="adminAi.currentModel.value"
              :items="availableModels"
              class="flex-1 w-full"
              @update:model-value="handleModelChange"
            />
            <UButton v-if="isModelUpdating" color="neutral" variant="outline" loading disabled />
          </div>
        </UFormField>
      </div>
    </UCard>

    <!-- System Prompts Configuration -->
    <UCard class="card-base border-default">
      <div
        class="sticky top-0 z-10 flex flex-col gap-3 border-b border-default bg-default/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-default/80"
      >
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-wider text-primary">Instructions</p>
          <h2 class="text-lg font-semibold text-default">System Prompts</h2>
        </div>
        <p class="text-sm text-muted">
          Modify the baseline instructions sent to the AI for specific internal domains or generator
          workflows. Changes take effect on the very next query.
        </p>
      </div>

      <div class="p-4 space-y-8">
        <div v-if="adminAi.promptsStatus.value === 'pending'" class="py-12 flex justify-center">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
        </div>

        <div
          v-else-if="!adminAi.systemPrompts.value || adminAi.systemPrompts.value.length === 0"
          class="py-12 text-center text-muted"
        >
          No system prompts configured in the database.
        </div>

        <div
          v-for="prompt in adminAi.systemPrompts.value"
          :key="prompt.name"
          class="space-y-3 pt-6 first:pt-0 border-default border-t first:border-t-0"
        >
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <h3 class="font-medium text-default font-mono text-sm">{{ prompt.name }}</h3>
              <p class="text-sm text-muted">{{ prompt.description }}</p>
            </div>

            <div class="flex items-center gap-2">
              <UButton
                v-if="isPromptChanged(prompt.name)"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-rotate-ccw"
                @click="resetPrompt(prompt.name)"
              />
              <UButton
                size="sm"
                color="primary"
                :disabled="!isPromptChanged(prompt.name)"
                :loading="adminAi.isUpdatingPrompt.value === prompt.name"
                @click="handleSavePrompt(prompt.name)"
              >
                Save Changes
              </UButton>
            </div>
          </div>

          <UTextarea
            v-model="editingPrompts[prompt.name]"
            autoresize
            :rows="4"
            class="w-full font-mono text-sm"
          />
          <p class="text-xs text-muted text-right">
            Last updated: {{ formatUpdatedAt(prompt.updatedAt) }}
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>
