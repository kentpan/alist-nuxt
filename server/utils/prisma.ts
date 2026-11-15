/**
 * Prisma 6's supported Cloudflare D1 adapter. Node uses the dedicated node:sqlite
 * adapter in database.ts because Prisma 6 does not ship an official node:sqlite
 * driver adapter; the Prisma schema remains the canonical relational model.
 */
export async function createD1PrismaClient(d1: unknown) {
  if (!d1 || typeof (d1 as { prepare?: unknown }).prepare !== 'function') {
    throw new TypeError('A Cloudflare D1 binding is required')
  }
  const [{ PrismaClient }, { PrismaD1 }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-d1')
  ])
  const adapter = new PrismaD1(d1 as any)
  return new PrismaClient({ adapter })
}
