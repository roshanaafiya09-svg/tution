import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks v7 (bundled with eslint-config-next 16)
    // added these two React-Compiler-readiness rules as errors by
    // default. They flag a widespread pre-existing pattern across this
    // codebase (setState from inside a data-fetching useEffect, one
    // Date.now() call during render) that isn't a bug — Next 16 doesn't
    // enable the React Compiler here (reactCompiler stays unset/false in
    // next.config.mjs). Fixing ~67 call sites is a real refactor, not a
    // dependency-security upgrade; downgraded to warn so `next build`/CI
    // aren't blocked, tracked as follow-up cleanup rather than silently
    // dropped.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  // A failed API request must NEVER be turned into "no data". Converting a
  // rejection into [] / 0 / null / {} is precisely how a broken backend used to
  // render as "No students", "0 classes" or an empty calendar. Load data with
  // useApiQuery + QueryBoundary (see src/lib/query, components/ui/query-boundary)
  // so a failure has its own state, and let the error propagate.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[params.length=0] > :matches(ArrayExpression, ObjectExpression, Literal, UnaryExpression, TemplateLiteral, TSAsExpression, TSSatisfiesExpression)",
          message:
            'Do not turn a failed request into fake data (.catch(() => [] / 0 / null / {})). Let the error propagate and render it with useApiQuery + QueryBoundary/ErrorState.',
        },
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression CallExpression[callee.name=/^set[A-Z]/] > :matches(ArrayExpression, Literal[value=null], Literal[value=0])",
          message:
            'Do not reset state to []/0/null inside a .catch — that hides the failure as an empty result. Use useApiQuery so the error is its own state.',
        },
        {
          selector:
            'CatchClause CallExpression[callee.name=/^set[A-Z]/] > :matches(ArrayExpression, Literal[value=0])',
          message:
            'Do not reset state to []/0 inside a catch — that hides the failure as an empty result. Use useApiQuery so the error is its own state.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
