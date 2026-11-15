export default defineEventHandler(() => ({
  status: 'ok',
  runtime: typeof process !== 'undefined' && process.versions?.node ? 'node' : 'edge',
  stage: 1,
  productionConnected: false
}))
