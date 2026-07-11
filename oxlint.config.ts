import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  rules: {
    "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
  },
  overrides: [
    {
      files: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*", "**/__benchmarks__/**"],
      rules: {
        "max-lines": "off",
      },
    },
  ],
});
