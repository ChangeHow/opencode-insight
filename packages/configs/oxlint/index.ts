import { defineConfig } from "oxlint";

export const baseConfig = defineConfig({
  categories: {
    correctness: "warn",
    suspicious: "warn",
  },
  rules: {
    "eq-eq-eq": "warn",
    "no-console": "off",
  },
});

export const reactConfig = defineConfig({
  plugins: ["react", "jsx-a11y"],
  rules: {
    "react/exhaustive-deps": "warn",
    "react/no-array-index-key": "off",
    "react/no-danger": "off",
    "react/self-closing-comp": "warn",
  },
});

export const nodeConfig = defineConfig({
  plugins: ["node"],
  rules: {
    "node/no-deprecated-api": "warn",
  },
});
