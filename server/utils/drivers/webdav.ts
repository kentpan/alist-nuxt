import { normalizeVirtualPath, type StorageFile } from '../storage'

export interface WebDavOptions {
  mountPath: string
  url: string
  username?: string
  password?: string
  fetcher?: typeof fetch
}

function xmlText(source: string, name: string): string {
  const tag = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`, 'i')
  const match = tag.exec(source)
  if (!match) return ''
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()
}

function propResponses(xml: string): string[] {
  return xml.match(/<(?:[\w.-]+:)?response\b[\s\S]*?<\/(?:[\w.-]+:)?response\s*>/gi) ?? []
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

export function createWebDavAdapter(options: WebDavOptions) {
  const mountPath = normalizeVirtualPath(options.mountPath)
  const base = new URL(options.url)
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('WebDAV URL must use HTTP or HTTPS')
  if (base.username || base.password) throw new Error('Put WebDAV credentials in username/password fields, not in the URL')
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const fetcher = options.fetcher ?? fetch
  const headers: Record<string, string> = { Accept: 'application/xml, text/xml, */*' }
  if (options.username || options.password) headers.Authorization = basicAuth(options.username ?? '', options.password ?? '')

  function relative(virtualPath: string): string {
    const normalized = normalizeVirtualPath(virtualPath)
    if (mountPath !== '/' && normalized !== mountPath && !normalized.startsWith(`${mountPath}/`)) throw new Error('Path is outside the WebDAV mount')
    return normalized === mountPath ? '' : (mountPath === '/' ? normalized.slice(1) : normalized.slice(mountPath.length + 1))
  }
  function urlFor(virtualPath: string): URL {
    return new URL(relative(virtualPath).split('/').filter(Boolean).map(encodeURIComponent).join('/'), base)
  }
  async function request(method: string, virtualPath: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetcher(urlFor(virtualPath), { ...init, method, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } })
    if (!response.ok && !(method === 'PROPFIND' && response.status === 207)) {
      const error = new Error(`WebDAV ${method} failed with HTTP ${response.status}`)
      Object.assign(error, { statusCode: response.status === 404 ? 404 : response.status === 409 ? 409 : response.status === 401 || response.status === 403 ? 403 : 502 })
      throw error
    }
    return response
  }
  function parseItem(xml: string, virtualPath: string): StorageFile {
    const name = xmlText(xml, 'displayname') || virtualPath.split('/').filter(Boolean).pop() || '/'
    const size = Number(xmlText(xml, 'getcontentlength') || 0)
    const date = xmlText(xml, 'getlastmodified')
    const modified = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : new Date(0).toISOString()
    const is_dir = /<(?:[\w.-]+:)?collection\b/i.test(xml)
    return { name, path: normalizeVirtualPath(virtualPath), size: is_dir ? 0 : size, is_dir, modified, created: modified }
  }
  async function propfind(virtualPath: string, depth: '0' | '1'): Promise<StorageFile[]> {
    const response = await request('PROPFIND', virtualPath, {
      headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>'
    })
    return propResponses(await response.text()).map(entry => {
      const href = xmlText(entry, 'href')
      let target = virtualPath
      if (href) {
        const hrefUrl = new URL(href, base)
        const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
        const rawSuffix = hrefUrl.pathname.startsWith(basePath) ? hrefUrl.pathname.slice(basePath.length) : (hrefUrl.pathname.startsWith('/') ? hrefUrl.pathname.slice(1) : hrefUrl.pathname)
        const decodedSuffix = decodeURIComponent(rawSuffix)
        const suffix = decodedSuffix.endsWith('/') ? decodedSuffix.slice(0, -1) : decodedSuffix
        target = normalizeVirtualPath(`${mountPath === '/' ? '' : mountPath}/${suffix}`)
      }
      return parseItem(entry, target)
    })
  }
  return {
    mountPath,
    async list(virtualPath: string) {
      return (await propfind(virtualPath, '1')).filter(item => item.path !== normalizeVirtualPath(virtualPath)).sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
    },
    async get(virtualPath: string) {
      const items = await propfind(virtualPath, '0')
      if (!items[0]) throw Object.assign(new Error('WebDAV resource not found'), { statusCode: 404 })
      return items[0]
    },
    async makeDir(virtualPath: string) { await request('MKCOL', virtualPath) },
    async put(virtualPath: string, data: Uint8Array, overwrite = false) {
      if (!overwrite) {
        try { await this.get(virtualPath); throw Object.assign(new Error('WebDAV destination already exists'), { statusCode: 409 }) }
        catch (error: any) { if (error?.statusCode !== 404) throw error }
      }
      await request('PUT', virtualPath, { headers: { 'Content-Type': 'application/octet-stream' }, body: data as BodyInit })
      return this.get(virtualPath)
    },
    async rename(virtualPath: string, newName: string) {
      if (!newName || newName === '.' || newName === '..' || /[\\/\\0]/.test(newName)) throw new Error('Invalid file name')
      const parent = normalizeVirtualPath(virtualPath).split('/').slice(0, -1).join('/') || '/'
      const destination = normalizeVirtualPath(`${parent}/${newName}`)
      await request('MOVE', virtualPath, { headers: { Destination: urlFor(destination).toString(), Overwrite: 'F' } })
    },
    async move(virtualPath: string, destinationDir: string) {
      const name = virtualPath.split('/').filter(Boolean).pop() || ''
      const destination = normalizeVirtualPath(`${destinationDir}/${name}`)
      await request('MOVE', virtualPath, { headers: { Destination: urlFor(destination).toString(), Overwrite: 'F' } })
    },
    async copy(virtualPath: string, destinationDir: string, overwrite = false) {
      const name = virtualPath.split('/').filter(Boolean).pop() || ''
      const destination = normalizeVirtualPath(`${destinationDir}/${name}`)
      await request('COPY', virtualPath, { headers: { Destination: urlFor(destination).toString(), Overwrite: overwrite ? 'T' : 'F', Depth: 'infinity' } })
    },
    async remove(virtualPath: string) { await request('DELETE', virtualPath) },
    async openRead(virtualPath: string) {
      const response = await request('GET', virtualPath)
      if (!response.body) throw new Error('WebDAV response has no readable body')
      return { stream: response.body, file: await this.get(virtualPath) }
    }
  }
}
