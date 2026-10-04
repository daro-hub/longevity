import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // Scoped to lib/domain/ only, mirroring the Python repo's own gate
      // (`pytest tests/domain --cov=app.domain --cov-fail-under=100`).
      // lib/llm/ and app/api/* were never under that contract either.
      include: ['lib/domain/**/*.js'],
      exclude: ['lib/domain/**/*.test.js'],
      // Branches intentionally NOT held to 100 here: the Python gate this
      // mirrors is line-only (coverage.py's default, no `branch = true`
      // in pyproject.toml -- confirmed, not assumed). A handful of
      // defensive branches (a `|| {}`/`|| []` fallback for malformed
      // data, a locale-fallback-of-a-fallback, a greedy-loop guard that's
      // unreachable given fitToTargets' own invariants) are genuinely
      // unreachable through the real call paths in both languages.
      thresholds: { lines: 100, functions: 100, statements: 100 }
    }
  }
})
