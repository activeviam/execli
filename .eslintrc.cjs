"use strict";

module.exports = {
  env: {
    es6: true,
  },
  extends: [
    "plugin:import/typescript",
    "plugin:unicorn/recommended",
    "xo",
    "xo-typescript",
    "prettier",
  ],
  overrides: [
    {
      files: "**/*.test.ts",
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
        // Enable when https://github.com/facebook/jest/pull/11331 is merged.
        "unicorn/prefer-node-protocol": "off",
      },
    },
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2018,
    extraFileExtensions: [".cjs"],
    project: ["tsconfig.js.json", "tsconfig.json", "tsconfig.test.json"],
    sourceType: "module",
  },
  plugins: [
    "import",
    "sort-destructure-keys",
    "typescript-sort-keys",
    "unicorn",
  ],
  root: true,
  rules: {
    // Index signatures are slightly more legible since the key must be named.
    "@typescript-eslint/consistent-indexed-object-style": [
      "error",
      "index-signature",
    ],
    // TypeScript is good at type inference and already requires types where they matter: exported symbols.
    "@typescript-eslint/explicit-function-return-type": "off",
    // We use sort-keys instead.
    "@typescript-eslint/member-ordering": "off",
    "@typescript-eslint/no-invalid-void-type": "off",
    "@typescript-eslint/prefer-readonly-parameter-types": [
      "error",
      { checkParameterProperties: true },
    ],
    "@typescript-eslint/require-array-sort-compare": "off",
    // It's useful to use template string to cast expressions to strings.
    "@typescript-eslint/restrict-template-expressions": "off",
    "arrow-body-style": "error",
    "capitalized-comments": "off",
    // Forbid function declarations
    "func-style": ["error", "expression", { allowArrowFunctions: true }],
    "import/exports-last": "off",
    "import/first": "error",
    "import/group-exports": "off",
    "import/no-cycle": "error",
    // Named export are better for static analysis.
    // See https://humanwhocodes.com/blog/2019/01/stop-using-default-exports-javascript-module/
    "import/no-default-export": "error",
    "import/no-duplicates": "error",
    "import/no-extraneous-dependencies": [
      "error",
      {
        bundledDependencies: false,
        devDependencies: false,
        optionalDependencies: false,
      },
    ],
    "import/no-mutable-exports": "error",
    "import/no-useless-path-segments": "error",
    "import/order": [
      "error",
      { alphabetize: { order: "asc" }, "newlines-between": "never" },
    ],
    // It's fine to use await in for loops instead of Promise.all to execute promises sequentially.
    "no-await-in-loop": "off",
    "no-console": "error",
    // TypeScript already takes care of that.
    // See https://github.com/bradzacher/eslint-plugin-typescript/issues/110.
    "no-undef": "off",
    "object-shorthand": [
      "error",
      "always",
      { avoidExplicitReturnArrows: true },
    ],
    "sort-destructure-keys/sort-destructure-keys": [
      "error",
      { caseSensitive: false },
    ],
    "sort-keys": [
      "error",
      "asc",
      { caseSensitive: false, minKeys: 2, natural: true },
    ],
    "typescript-sort-keys/interface": "error",
    "typescript-sort-keys/string-enum": "error",
    "unicorn/prevent-abbreviations": [
      "error",
      {
        replacements: {
          lib: {
            library: false,
          },
        },
      },
    ],
  },
};
