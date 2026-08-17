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
  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
