module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true,
    mocha: true,
  },
  extends: ['airbnb-base', 'prettier'],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    'max-len': ['error', { code: 120 }],
    'arrow-parens': 0,
    'no-underscore-dangle': 0,
    'class-methods-use-this': 0,
    'no-restricted-syntax': 0,
    quotes: 0,
    'import/order': 0,
    'no-console': 0,
    'no-continue': 0,
    'no-use-before-define': 0,
    'object-curly-newline': 0,
    'consistent-return': 0,
    'no-await-in-loop': 0,
    'no-param-reassign': 0,
    'operator-linebreak': 0,
    'prefer-destructuring': 0,
    'no-plusplus': 0,
    'guard-for-in': 0,
    'import/no-dynamic-require': 0,
    'global-require': 0,
    'no-empty-function': 0,
    camelcase: 0,
  },
};
