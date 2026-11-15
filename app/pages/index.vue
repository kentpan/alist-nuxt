<script setup lang="ts">
type FileItem = {
  name: string
  path: string
  size: number
  is_dir: boolean
  modified: string
  created: string
  type?: number
}

type ApiResult<T> = { code: number; message?: string; data: T }

const token = useCookie<string>('alist_token', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 })
const username = ref('admin')
const password = ref('')
const currentPath = ref('/local')
const files = ref<FileItem[]>([])
const selectedPath = ref('')
const previewUrl = ref('')
const previewType = ref(0)
const previewName = ref('')
const previewText = ref('')
const previewError = ref('')
const renameName = ref('')
const destinationPath = ref('/local')
const localRoot = ref('/tmp/alist-nuxt-storage')
const mountPath = ref('/local')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const isLoggedIn = computed(() => Boolean(token.value))
const previewKind = computed(() => {
  if (previewType.value === 5) return 'image'
  if (previewType.value === 2) return 'video'
  if (previewType.value === 3) return 'audio'
  if (previewType.value === 4) return 'text'
  if (previewName.value.toLowerCase().endsWith('.pdf')) return 'pdf'
  return 'download'
})

async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      ...(token.value ? { authorization: token.value } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      'client-id': 'alist-nuxt-web'
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  })
  const result = await response.json() as ApiResult<T>
  if (!response.ok || result.code !== 200) throw new Error(result.message || `Request failed: ${response.status}`)
  return result.data
}

async function login() {
  busy.value = true
  error.value = ''
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'client-id': 'alist-nuxt-web' },
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    const result = await response.json() as ApiResult<{ token: string }>
    if (!response.ok || result.code !== 200 || !result.data?.token) throw new Error(result.message || '登录失败')
    token.value = result.data.token
    password.value = ''
    await loadFiles()
  } catch (cause: any) {
    error.value = cause?.message || '登录失败'
  } finally {
    busy.value = false
  }
}

async function logout() {
  try { await api('/api/auth/logout') } catch {}
  token.value = ''
  files.value = []
  selectedPath.value = ''
  currentPath.value = '/'
}

async function loadFiles(path = currentPath.value) {
  busy.value = true
  error.value = ''
  try {
    const result = await api<{ content: FileItem[]; total: number; provider: string; write: boolean }>('/api/fs/list', { method: 'POST', body: { path } })
    currentPath.value = path
    files.value = result.content ?? []
    selectedPath.value = ''
    previewUrl.value = ''
    previewType.value = 0
    previewName.value = ''
    previewText.value = ''
    previewError.value = ''
  } catch (cause: any) {
    error.value = cause?.message || '读取目录失败'
    files.value = []
  } finally {
    busy.value = false
  }
}

async function openItem(item: FileItem) {
  if (item.is_dir) return loadFiles(item.path)
  selectedPath.value = item.path
  renameName.value = item.name
  previewName.value = item.name
  previewUrl.value = ''
  previewText.value = ''
  previewError.value = ''
  try {
    const info = await api<{ raw_url: string; type: number }>('/api/fs/get', { method: 'POST', body: { path: item.path } })
    previewUrl.value = info.raw_url
    previewType.value = info.type
    if (previewKind.value === 'text' && previewUrl.value) {
      const response = await fetch(previewUrl.value)
      if (!response.ok) throw new Error(`预览请求失败：${response.status}`)
      previewText.value = (await response.text()).slice(0, 250000)
    }
  } catch (cause: any) {
    previewError.value = cause?.message || '文件预览失败'
  }
}

function goUp() {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  return loadFiles(parts.length ? `/${parts.join('/')}` : '/')
}

async function createFolder() {
  const name = window.prompt('请输入新文件夹名称')
  if (!name?.trim()) return
  busy.value = true
  try {
    await api('/api/fs/mkdir', { method: 'POST', body: { path: `${currentPath.value === '/' ? '' : currentPath.value}/${name.trim()}` } })
    notice.value = '文件夹已创建'
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '创建文件夹失败' }
  finally { busy.value = false }
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    const target = `${currentPath.value === '/' ? '' : currentPath.value}/${file.name}`
    const response = await fetch('/api/fs/put', {
      method: 'PUT',
      headers: { authorization: token.value, 'File-Path': target, Overwrite: 'false', 'client-id': 'alist-nuxt-web' },
      body: file
    })
    const result = await response.json() as ApiResult<unknown>
    if (!response.ok || result.code !== 200) throw new Error(result.message || '上传失败')
    notice.value = `已上传：${file.name}`
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '上传失败' }
  finally {
    busy.value = false
    input.value = ''
  }
}

async function renameSelected() {
  if (!selectedPath.value || !renameName.value.trim()) return
  busy.value = true
  try {
    await api('/api/fs/rename', { method: 'POST', body: { path: selectedPath.value, name: renameName.value.trim() } })
    notice.value = '已重命名'
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '重命名失败' }
  finally { busy.value = false }
}

async function copySelected() {
  if (!selectedPath.value) return
  const name = selectedPath.value.split('/').filter(Boolean).pop() || ''
  const sourceDir = selectedPath.value.slice(0, selectedPath.value.lastIndexOf('/')) || '/'
  busy.value = true
  try {
    await api('/api/fs/copy', { method: 'POST', body: { src_dir: sourceDir, dst_dir: destinationPath.value, names: [name] } })
    notice.value = '已复制'
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '复制失败' }
  finally { busy.value = false }
}

async function moveSelected() {
  if (!selectedPath.value) return
  const name = selectedPath.value.split('/').filter(Boolean).pop() || ''
  const sourceDir = selectedPath.value.slice(0, selectedPath.value.lastIndexOf('/')) || '/'
  busy.value = true
  try {
    await api('/api/fs/move', { method: 'POST', body: { src_dir: sourceDir, dst_dir: destinationPath.value, names: [name] } })
    notice.value = '已移动'
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '移动失败' }
  finally { busy.value = false }
}

async function removeSelected() {
  if (!selectedPath.value || !window.confirm(`确定删除 ${selectedPath.value} 吗？`)) return
  const name = selectedPath.value.split('/').filter(Boolean).pop() || ''
  const dir = selectedPath.value.slice(0, selectedPath.value.lastIndexOf('/')) || '/'
  busy.value = true
  try {
    await api('/api/fs/remove', { method: 'POST', body: { dir, names: [name] } })
    notice.value = '已删除'
    await loadFiles()
  } catch (cause: any) { error.value = cause?.message || '删除失败' }
  finally { busy.value = false }
}

async function addLocalStorage() {
  busy.value = true
  try {
    await api('/api/admin/storage/create', {
      method: 'POST',
      body: { mount_path: mountPath.value, driver: 'Local', addition: { root_path: localRoot.value, show_hidden: false } }
    })
    notice.value = '本地存储已添加'
    await loadFiles(mountPath.value)
  } catch (cause: any) { error.value = cause?.message || '添加存储失败' }
  finally { busy.value = false }
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

onMounted(() => {
  if (token.value) loadFiles()
})
</script>

<template>
  <div class="space-y-6">
    <section v-if="!isLoggedIn" class="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p class="text-sm font-semibold text-indigo-600">Alist Nuxt · Stage 4</p>
      <h1 class="mt-2 text-2xl font-semibold text-slate-900">登录管理面板</h1>
      <p class="mt-2 text-sm text-slate-500">使用本地迁移环境中的管理员账号登录。</p>
      <form class="mt-6 space-y-4" @submit.prevent="login">
        <label class="block text-sm font-medium text-slate-700">用户名
          <input v-model="username" autocomplete="username" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required>
        </label>
        <label class="block text-sm font-medium text-slate-700">密码
          <input v-model="password" type="password" autocomplete="current-password" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required>
        </label>
        <button :disabled="busy" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">{{ busy ? '登录中…' : '登录' }}</button>
      </form>
    </section>

    <template v-else>
      <section class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">文件管理</h1>
          <p class="mt-1 text-sm text-slate-500">当前目录：<code>{{ currentPath }}</code></p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="goUp">上一级</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="loadFiles()">刷新</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="logout">退出登录</button>
        </div>
      </section>

      <section v-if="error.includes('No enabled storage')" class="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 class="font-semibold text-amber-900">还没有配置本地存储</h2>
        <p class="mt-1 text-sm text-amber-800">请指定服务端可访问的目录。此操作只配置当前运行环境，不会连接生产存储。</p>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <label class="text-sm font-medium text-amber-900">挂载路径
            <input v-model="mountPath" class="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2">
          </label>
          <label class="text-sm font-medium text-amber-900">服务端目录
            <input v-model="localRoot" class="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2">
          </label>
        </div>
        <button class="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white" :disabled="busy" @click="addLocalStorage">添加本地存储</button>
      </section>

      <section class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div class="font-medium text-slate-800">文件列表 <span class="text-sm font-normal text-slate-500">({{ files.length }})</span></div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="createFolder">新建文件夹</button>
            <label class="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white" :class="{ 'opacity-50': busy }">
              上传文件
              <input type="file" class="hidden" :disabled="busy" @change="uploadFile">
            </label>
          </div>
        </div>
        <div v-if="busy" class="px-5 py-3 text-sm text-slate-500">处理中…</div>
        <div v-if="!files.length && !busy" class="px-5 py-12 text-center text-sm text-slate-500">此目录为空</div>
        <div v-for="file in files" :key="file.path" class="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0" :class="{ 'bg-indigo-50': selectedPath === file.path }">
          <button class="min-w-0 flex-1 text-left" @click="openItem(file)">
            <span class="mr-2">{{ file.is_dir ? '📁' : '📄' }}</span>
            <span class="break-all font-medium text-slate-800">{{ file.name }}</span>
            <span class="ml-3 text-xs text-slate-500">{{ file.is_dir ? '文件夹' : formatSize(file.size) }}</span>
          </button>
          <span class="text-xs text-slate-400">{{ new Date(file.modified).toLocaleString() }}</span>
          <button class="rounded-md border border-slate-300 px-2 py-1 text-xs" @click="openItem(file)">选择</button>
        </div>
      </section>

      <section v-if="selectedPath" class="rounded-xl border border-slate-200 bg-white p-5">
        <h2 class="font-semibold text-slate-900">操作：{{ selectedPath }}</h2>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <label class="text-sm text-slate-600">新名称
            <input v-model="renameName" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
          </label>
          <label class="text-sm text-slate-600">复制/移动到目录
            <input v-model="destinationPath" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="renameSelected">重命名</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="copySelected">复制</button>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="busy" @click="moveSelected">移动</button>
          <button class="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700" :disabled="busy" @click="removeSelected">删除</button>
        </div>
        <div v-if="previewUrl" class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="font-medium text-slate-800">文件预览：{{ previewName }}</h3>
            <a class="text-sm text-indigo-700 underline" :href="previewUrl" target="_blank" rel="noreferrer">在新窗口打开</a>
          </div>
          <img v-if="previewKind === 'image'" :src="previewUrl" :alt="previewName" class="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain">
          <video v-else-if="previewKind === 'video'" :src="previewUrl" controls preload="metadata" class="max-h-[65vh] w-full rounded-lg bg-black" />
          <audio v-else-if="previewKind === 'audio'" :src="previewUrl" controls preload="metadata" class="w-full" />
          <iframe v-else-if="previewKind === 'pdf'" :src="previewUrl" :title="previewName" class="h-[65vh] w-full rounded-lg border-0 bg-white" />
          <pre v-else-if="previewKind === 'text'" class="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm text-slate-800">{{ previewText }}</pre>
          <div v-else class="text-sm text-slate-600">此文件类型暂不支持内嵌预览。</div>
          <p v-if="previewError" class="mt-2 text-sm text-rose-700">{{ previewError }}</p>
        </div>
        <p v-else-if="previewError" class="mt-4 text-sm text-rose-700">{{ previewError }}</p>
      </section>
    </template>

    <p v-if="notice" class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{{ notice }}</p>
    <p v-if="error && !error.includes('No enabled storage')" class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</p>
  </div>
</template>
