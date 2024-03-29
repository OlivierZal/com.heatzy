const globals = require('globals')
const importPlugin = require('eslint-plugin-import')
const js = require('@eslint/js')
const parser = require('@typescript-eslint/parser')
const prettier = require('eslint-config-prettier')
const stylistic = require('@stylistic/eslint-plugin')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

const [jsOverrides] = tsPlugin.configs['eslint-recommended'].overrides

module.exports = [
  { ignores: ['.homeybuild/'] },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      parser,
      parserOptions: { project: './tsconfig.json' },
      sourceType: 'module',
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    plugins: {
      '@stylistic': stylistic,
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...js.configs.all.rules,
      ...importPlugin.configs.recommended.rules,
      'max-lines': 'off',
      'no-ternary': 'off',
      'no-underscore-dangle': ['error', { allow: ['__'] }],
      'one-var': 'off',
    },
  },
  { files: ['**/*.js'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.ts'],
    rules: {
      ...jsOverrides.rules,
      ...tsPlugin.configs.all.rules,
      ...importPlugin.configs.typescript.rules,
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: {
            memberTypes: [
              // Index signature
              'signature',
              'readonly-signature',

              // Fields
              'public-static-field',
              'public-static-readonly-field',
              'protected-static-field',
              'protected-static-readonly-field',
              'private-static-field',
              'private-static-readonly-field',
              '#private-static-field',
              '#private-static-readonly-field',

              'public-decorated-field',
              'public-decorated-readonly-field',
              'protected-decorated-field',
              'protected-decorated-readonly-field',
              'private-decorated-field',
              'private-decorated-readonly-field',

              'public-instance-field',
              'public-instance-readonly-field',
              'protected-instance-field',
              'protected-instance-readonly-field',
              'private-instance-field',
              'private-instance-readonly-field',
              '#private-instance-field',
              '#private-instance-readonly-field',

              'public-abstract-field',
              'public-abstract-readonly-field',
              'protected-abstract-field',
              'protected-abstract-readonly-field',

              'public-field',
              'public-readonly-field',
              'protected-field',
              'protected-readonly-field',
              'private-field',
              'private-readonly-field',
              '#private-field',
              '#private-readonly-field',

              'static-field',
              'static-readonly-field',
              'instance-field',
              'instance-readonly-field',
              'abstract-field',
              'abstract-readonly-field',

              'decorated-field',
              'decorated-readonly-field',

              'field',
              'readonly-field',

              // Static initialization
              'static-initialization',

              // Constructors
              'public-constructor',
              'protected-constructor',
              'private-constructor',

              // Getters and setters
              ['public-static-get', 'public-static-set'],
              ['protected-static-get', 'protected-static-set'],
              ['private-static-get', 'private-static-set'],
              ['#private-static-get', '#private-static-set'],

              ['public-decorated-get', 'public-decorated-set'],
              ['protected-decorated-get', 'protected-decorated-set'],
              ['private-decorated-get', 'private-decorated-set'],

              ['public-instance-get', 'public-instance-set'],
              ['protected-instance-get', 'protected-instance-set'],
              ['private-instance-get', 'private-instance-set'],
              ['#private-instance-get', '#private-instance-set'],

              ['public-abstract-get', 'public-abstract-set'],
              ['protected-abstract-get', 'protected-abstract-set'],

              ['public-get', 'public-set'],
              ['protected-get', 'protected-set'],
              ['private-get', 'private-set'],
              ['#private-get', '#private-set'],

              ['static-get', 'static-set'],
              ['instance-get', 'instance-set'],
              ['abstract-get', 'abstract-set'],

              ['decorated-get', 'decorated-set'],

              ['get', 'set'],

              // Methods
              'public-static-method',
              'protected-static-method',
              'private-static-method',
              '#private-static-method',
              'public-decorated-method',
              'protected-decorated-method',
              'private-decorated-method',
              'public-instance-method',
              'protected-instance-method',
              'private-instance-method',
              '#private-instance-method',
              'public-abstract-method',
              'protected-abstract-method',
            ],
            optionalityOrder: 'optional-first',
            order: 'natural-case-insensitive',
          },
        },
      ],
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-magic-numbers': ['error', { ignoreEnums: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: 'onHomeyReady' },
      ],
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      'import/extensions': 'off',
      'import/no-duplicates': ['error', { 'prefer-inline': true }],
    },
    settings: {
      ...importPlugin.configs.typescript.settings,
      'import/ignore': ['node_modules'],
      'import/resolver': {
        ...importPlugin.configs.typescript.settings['import/resolver'],
        typescript: { alwaysTryTypes: true },
      },
    },
  },
  { rules: { '@stylistic/lines-between-class-members': 'error' } },
  prettier,
]
