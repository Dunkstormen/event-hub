import eslint from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

const webFiles = ["apps/web/**/*.{js,mjs,cjs,ts,tsx}"];
const serverTypeScriptFiles = ["apps/api/**/*.ts", "packages/**/*.ts"];
const serverTypeScriptConfig = typescriptEslint.configs.recommended.map(
  (config) => ({
    ...config,
    files: serverTypeScriptFiles,
  }),
);
const nextConfig = [...nextVitals, ...nextTypeScript].map((config) => ({
  ...config,
  files: webFiles,
}));

const config = [
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/node_modules/**",
    ],
  },
  eslint.configs.recommended,
  ...serverTypeScriptConfig,
  ...nextConfig,
  {
    files: serverTypeScriptFiles,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: webFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      next: {
        rootDir: "apps/web/",
      },
      react: {
        version: "19.2",
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@event-hub/database",
              message: "The web app must access persistence through the API.",
            },
            {
              name: "@prisma/client",
              message: "The web app must not import Prisma.",
            },
          ],
          patterns: [
            {
              group: ["@event-hub/database/*", "@prisma/*"],
              message: "The web app must access persistence through the API.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
];

export default config;
