/**
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
    env: { es6: true, node: true },
    parserOptions: {
        project: './tsconfig.lint.json',
    },
    extends: [
        'airbnb-typescript/base',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:prettier/recommended', // includes plugin: prettier
    ],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    rules: {
        'prettier/prettier': 'error',
        eqeqeq: 'error',
        'spaced-comment': ['error', 'always', { markers: ['/'] }],
        'global-require': 'off',
        'no-console': 'warn',
        'no-underscore-dangle': 'off',
        'no-param-reassign': 'off',
        'no-return-await': 'off',
        'no-multi-assign': 'off',
        'no-unused-expressions': 'off',
        'no-throw-literal': 'off',
        'no-plusplus': 'off',
        'no-shadow': 'off',
        'guard-for-in': 'off',
        'no-loop-func': 'off',
        'no-restricted-syntax': ['error', 'WithStatement'],
        'import/no-dynamic-require': 'off',
        'import/order': ['error', { 'newlines-between': 'never' }],
        'import/prefer-default-export': 'off',
        'import/no-duplicates': 'off',
        'import/no-unresolved': 'error',

        /**
         * For DDD
         */
        'max-classes-per-file': 'off',

        /**
         * For Jest, Storybook
         */
        'import/no-extraneous-dependencies': [
            'error',
            { devDependencies: ['**/*.spec.*', '**/*.test.*', '**/*.stories.*'] },
        ],

        /**
         * For TypeScript
         */
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/no-shadow': 'warn',
        '@typescript-eslint/no-loop-func': 'off',
        'no-use-before-define': 'off', // with @typescript-eslint/no-use-before-define
        '@typescript-eslint/no-use-before-define': [
            'error',
            { typedefs: false, functions: false, classes: false, variables: true },
        ],
        'no-unused-vars': 'off', // with @typescript-eslint/no-unused-vars
        '@typescript-eslint/no-unused-vars': [
            'warn',
            {
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_',
            },
        ],
    },
    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts'],
        },
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true, // always try to resolve types under `<root>@types` directory even it doesn't contain any source code, like `@types/unist`
            },
        },
    },
    // https://github.com/typescript-eslint/typescript-eslint/blob/master/docs/getting-started/linting/FAQ.md#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
    overrides: [
        {
            files: ['*.ts'],
            rules: {
                'no-undef': 'off',
            },
        },
    ],
};
