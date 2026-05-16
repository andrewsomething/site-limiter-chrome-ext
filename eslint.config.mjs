import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'extension/icons/**', 'extension/stats.bundle.js'],
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
        history: 'readonly',
        confirm: 'readonly',
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
        // page-utils.js globals (loaded via script tag before popup/sites/settings)
        DEFAULT_WATCH_LIMIT_MS: 'readonly',
        sendMessage: 'readonly',
        escapeHtml: 'readonly',
        loadState: 'readonly',
        renderSites: 'readonly',
        renderSiteGroup: 'readonly',
        renderSettings: 'readonly',
        initAddSite: 'readonly',
        initSettings: 'readonly',
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
    // stats.js uses ESM imports (bundled by esbuild)
    files: ['extension/stats.js'],
    languageOptions: {
      sourceType: 'module',
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
    // page-utils.js defines globals intentionally consumed by popup/sites/settings via script tag
    files: ['extension/lib/page-utils.js'],
    rules: {
      'no-unused-vars': 'off',
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
