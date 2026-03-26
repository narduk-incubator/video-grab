<script setup lang="ts">
/**
 * AppConfirmModal — Generic confirmation dialog.
 *
 * Wraps UModal for "Are you sure?" patterns. Supports customizable title,
 * message, button labels, colors, and a loading state on the confirm button.
 *
 * Usage:
 *   <AppConfirmModal
 *     v-model="showDeleteModal"
 *     title="Delete invoice?"
 *     message="This action cannot be undone."
 *     confirm-label="Delete"
 *     confirm-color="error"
 *     :loading="isDeleting"
 *     @confirm="handleDelete"
 *   />
 */

const modelValue = defineModel<boolean>({ default: false })

const _props = withDefaults(
  defineProps<{
    /** Modal title. */
    title?: string
    /** Description text. */
    message?: string
    /** Icon shown next to the title. */
    icon?: string
    /** Confirm button label. */
    confirmLabel?: string
    /** Cancel button label. */
    cancelLabel?: string
    /** Confirm button color. */
    confirmColor?: 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'
    /** Whether the confirm button shows a loading spinner. */
    loading?: boolean
    /** Whether the modal can be closed by clicking outside or pressing Escape. */
    dismissible?: boolean
  }>(),
  {
    title: 'Are you sure?',
    message: '',
    icon: 'i-lucide-alert-triangle',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmColor: 'error',
    loading: false,
    dismissible: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  modelValue.value = false
  emit('cancel')
}
</script>

<template>
  <UModal v-model:open="modelValue" :dismissible="dismissible">
    <template #content>
      <div class="p-6 space-y-4">
        <!-- Header -->
        <div class="flex items-start gap-3">
          <div
            v-if="icon"
            class="shrink-0 flex size-10 items-center justify-center rounded-full bg-error/10 text-error"
          >
            <UIcon :name="icon" class="size-5" />
          </div>
          <div>
            <h3 class="font-semibold text-default text-lg">{{ title }}</h3>
            <p v-if="message" class="mt-1 text-sm text-muted">{{ message }}</p>
          </div>
        </div>

        <!-- Extra content slot -->
        <slot />

        <!-- Actions -->
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            color="neutral"
            variant="soft"
            :label="cancelLabel"
            :disabled="loading"
            @click="handleCancel"
          />
          <UButton
            :color="confirmColor"
            :label="confirmLabel"
            :loading="loading"
            @click="handleConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
