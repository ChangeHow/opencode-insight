import { fileURLToPath } from "node:url";
export { default as manifest } from "./package.json" with { type: "json" };

export const directory = fileURLToPath(new URL(".", import.meta.url));
