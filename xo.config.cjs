"use strict";

module.exports = {
  extends: ["prettier"],
  overrides: [
    {
      files: "**/*.{ts,tsx}",
      rules: {
        "@typescript-eslint/consistent-type-exports": "off",
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
  rules: {
    // Forbid function declarations
    "func-style": ["error", "expression", { allowArrowFunctions: true }],
    // Redundant with `import/no-default-export`.
    "import/no-anonymous-default-export": "off",
    // Named export are better for static analysis.
    // See https://humanwhocodes.com/blog/2019/01/stop-using-default-exports-javascript-module/
    "import/no-default-export": "error",
    // Gives false positives when importing ES exports containing `/`.
    "n/file-extension-in-import": "off",
    "sort-destructure-keys/sort-destructure-keys": [
      "error",
      {
        caseSensitive: false,
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
