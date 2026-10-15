import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Unit/component tests: `npm test`. Coverage: `npm run test:coverage` (fails under 80%).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
})
