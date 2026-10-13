<template>
  <div class="page-header">
    <div class="page-header-text">
      <h1 v-if="title">{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="page-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0;
  color: #17233d;
  font-size: 24px;
  font-weight: 700;
}

.page-header p {
  margin: 4px 0 0;
  color: #8590a3;
  font-size: 14px;
}

.page-header-actions {
  flex-shrink: 0;
}
</style>
