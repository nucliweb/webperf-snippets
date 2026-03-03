const preferDynamicImport = require('./eslint-rules/prefer-dynamic-import-with-feature-guard.js')

module.exports = [
  {
    plugins: {
      local: {
        rules: {
          'prefer-dynamic-import-with-feature-guard': preferDynamicImport,
        },
      },
    },
    rules: {
      'local/prefer-dynamic-import-with-feature-guard': 'warn',
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
]
