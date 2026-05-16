import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'icons/**'],
  },
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        Date: 'readonly',
        Object: 'readonly',
        // Chrome extension globals
        chrome: 'readonly',
        // Shared utility globals (lib/utils.js loaded via script tag before content/popup)
        formatCountdown: 'readonly',
        formatWatchTime: 'readonly',
        patternToRegex: 'readonly',
        registrableDomain: 'readonly',
        matchSite: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-console': 'warn',
    },
  },
  {
    // Node.js files that use module.exports
    files: ['extension/background.js', 'extension/lib/utils.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        require: 'readonly',
      },
    },
  },
  eslintConfigPrettier,
];
