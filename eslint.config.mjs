import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.min.js",
      "packages/db/src/generated/**",
      "services/**",
      "specs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { URL: "readonly", console: "readonly", process: "readonly" } },
  },
  {
    // Constitution: LiteLLM is the only LLM entry point; provider SDKs live in one place.
    files: ["**/*.{ts,tsx,mjs,js}"],
    ignores: ["packages/shared/src/llm/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "openai", message: "Use @storyflow/shared/llm (LiteLLM only)." }],
          patterns: [{ group: ["@anthropic-ai/*"], message: "Cloud SDKs are forbidden." }],
        },
      ],
    },
  },
);
