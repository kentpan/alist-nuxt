export default defineNuxtConfig({
  compatibilityDate: '2026-11-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [],
  nitro: {
    preset: process.env.NITRO_PRESET || 'node-server',
    experimental: { wasm: true },
    externals: { external: ['node:sqlite'] }
  },
  runtimeConfig: {
    databasePath: process.env.DATABASE_PATH || './data/alist-nuxt.db',
    jwtSecret: process.env.JWT_SECRET || 'local-development-only-change-this-secret',
    adminToken: process.env.ADMIN_TOKEN || '',
    tokenExpiresIn: Number(process.env.TOKEN_EXPIRES_IN || 48),
    public: { appName: 'Alist Nuxt' }
  },
  typescript: { strict: true, typeCheck: true }
})
