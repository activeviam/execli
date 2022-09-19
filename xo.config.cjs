"use strict";

module.exports = {
  overrides: [
    {
      files: "**/*.{ts,tsx}",
      rules: {
        "@typescript-eslint/consistent-type-exports": ["off"],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "no-type-imports" },
        ],
        // Too annoying.
        "@typescript-eslint/restrict-template-expressions": "off",
      },
    },
  ],
  plugins: ["sort-destructure-keys", "typescript-sort-keys"],
  prettier: true,
  rules: {
    // Forbid function declarations
    "func-style": ["error", "expression", { allowArrowFunctions: true }],
    // Named export are better for static analysis.
    // See https://humanwhocodes.com/blog/2019/01/stop-using-default-exports-javascript-module/
    "import/no-default-export": "error",
    "import/order": [
      "error",
      {
        alphabetize: {
          order: "asc",
        },
        "newlines-between": "never",
      },
    ],
    // Does not support `"exports"` in `package.json`.
    "n/file-extension-in-import": "off",
    "sort-destructure-keys/sort-destructure-keys": [
      "error",
      {
        caseSensitive: false,
      },
    ],
    "sort-imports": [
      "error",
      {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      },
    ],
    "sort-keys": [
      "error",
      "asc",
      {
        caseSensitive: false,
        minKeys: 2,
        natural: true,
      },
    ],
    "typescript-sort-keys/interface": "error",
    "typescript-sort-keys/string-enum": "error",
  },
};
