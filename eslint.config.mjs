import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// ESLint settings (run with "npm run lint"). Next.js 16 removed "next lint", so ESLint runs directly.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Much of the code still uses "any" where a real type belongs. Shown as warnings until it is typed properly.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Some pages reset state from an effect (for example going back to page 1 when a filter changes).
      // It works, but React prefers other patterns; shown as warnings to tidy up over time.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // The tests and scripts are plain Node scripts (CommonJS), run with "npm test" and "npm run dev:local".
    files: ['tests/**/*.js', 'scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
