<script setup lang="ts">
const { data: health } = await useFetch('/api/health')
</script>
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <p class="text-sm font-medium text-indigo-600">Stage 1 · Runtime foundation</p>
    <h1 class="mt-3 text-3xl font-semibold tracking-tight">Alist migration workspace</h1>
    <p class="mt-3 max-w-2xl text-slate-600">This workspace is being rebuilt against the pinned upstream Alist backend and frontend sources. Production services and credentials are intentionally not configured.</p>
    <div class="mt-8 rounded-xl bg-slate-50 p-4 text-sm">
      <div class="font-medium">Runtime health</div>
      <pre class="mt-2 overflow-auto text-xs text-slate-600">{{ health || 'Checking…' }}</pre>
    </div>
  </section>
</template>
