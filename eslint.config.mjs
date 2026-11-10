import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'graphify-out/**'],
  },
  {
    files: ['api/**/*.ts', 'worker/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // Each jest.config.ts sits outside every tsconfig, so it gets the default project.
        projectService: { allowDefaultProject: ['api/jest.config.ts', 'worker/jest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // All output goes through the Pino logger (ARCH §10).
      'no-console': 'error',
      // AGENTS.md TypeScript rules: no any, annotated return types.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Express 4 takes async handlers as void callbacks. Every handler and async middleware
    // wraps its body in try/catch and calls next(err) (AGENTS.md), so the promise never rejects.
    files: ['api/src/routes/**/*.ts', 'api/src/middleware/**/*.ts'],
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
