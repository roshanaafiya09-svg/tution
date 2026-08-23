// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Mock providers (MockAiProvider, MockPaymentsProvider, etc.) and a
      // couple of "real" providers that intentionally throw synchronously
      // instead of doing real async work (e.g. RazorpayPaymentsProvider's
      // simulateCapture) are `async` only to satisfy an interface whose
      // real implementation genuinely awaits a network call — same
      // pragmatic downgrade as the two rules above, not a blanket opt-out.
      '@typescript-eslint/require-await': 'warn',
      // This codebase's own convention for "must exist for an interface
      // signature but is intentionally unused" is an underscore prefix
      // (see e.g. MockPaymentsProvider.verifyWebhook's _rawBody/_signature)
      // — recognise it instead of flagging every instance.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
