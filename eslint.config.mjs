import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/generated/**',
      // Throwaway Phase 0 spikes: plain CommonJS, not held to the strict TS rules.
      'spikes/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/server/src/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
);
