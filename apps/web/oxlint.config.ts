import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "warn",
    suspicious: "warn",
  },
  plugins: ["react", "jsx-a11y", "typescript", "import", "unicorn"],
  rules: {
    "eq-eq-eq": "warn",
    "no-console": "off",
    "react-in-jsx-scope": "off",
    "react/exhaustive-deps": "warn",
    "react/no-array-index-key": "off",
    "react/no-danger": "off",
    "react/self-closing-comp": "warn",
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
  ],
});
