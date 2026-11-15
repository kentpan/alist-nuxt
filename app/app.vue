<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <NuxtLink to="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">A</span>
          Alist Nuxt
        </NuxtLink>
        <span class="text-xs text-slate-500">本地迁移环境 · 不连接生产服务</span>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><NuxtPage /></main>
  </div>
</template>
