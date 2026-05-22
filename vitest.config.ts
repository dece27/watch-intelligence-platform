import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('./src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
