import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "warn",
    suspicious: "warn",
  },
  plugins: ["node", "typescript", "import", "unicorn"],
  rules: {
    "eq-eq-eq": "warn",
    "no-console": "off",
    "node/no-deprecated-api": "warn",
    "no-unused-vars": "warn",
    "typescript/no-explicit-any": "off",
  },
  overrides: [
    {
      files: ["**/__tests__/**"],
      rules: {
        "no-console": "off",
      },
    },
    {
      files: ["**/index.ts", "**/app.ts"],
      rules: {
        "import/no-unassigned-import": "off",
      },
    },
  ],
});
