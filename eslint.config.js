import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'coverage/**', '**/*.snap', 'src/sw.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...vue.configs['flat/recommended'],
  ...vue.configs['flat/strongly-recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        __APP_BUILD_TIME__: 'readonly',
      },
      parserOptions: {
        // For `<script lang="ts">` in SFCs, vue-eslint-parser needs the
        // TypeScript parser as its sub-parser.
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // TypeScript strict is the baseline; `interface` stays allowed on purpose.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      // TypeScript already knows the DOM lib; `no-undef` only applies to .js/.mjs.
      'no-undef': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'object-shorthand': 'error',
      // SFCs: Prettier handles formatting.
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  {
    // Workers and browser quirks without DOM types.
    files: ['src/workers/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
        self: 'readonly',
      },
    },
  },
  {
    // Admin UI: rapid prototyping with loosely typed API responses.
    files: ['src/admin/**/*.ts', 'src/admin/**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'server/**/*.mjs', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettier,
)
