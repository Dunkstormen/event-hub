import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "var",
]);
const checkedExtensions = new Set([
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".prisma",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const checkedNames = new Set([".env.example", ".gitignore", ".nvmrc"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (
      entry.isFile() &&
      (checkedExtensions.has(extname(entry.name)) ||
        checkedNames.has(entry.name))
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

const failures = [];

for (const file of await collectFiles(repositoryRoot)) {
  const content = await readFile(file, "utf8");
  const displayPath = relative(repositoryRoot, file).replaceAll("\\", "/");

  if (/[ \t]+(?:\r?\n|$)/u.test(content)) {
    failures.push(`${displayPath}: contains trailing whitespace`);
  }

  if (content.length > 0 && !content.endsWith("\n")) {
    failures.push(`${displayPath}: is missing a final newline`);
  }
}

if (failures.length > 0) {
  console.error("Formatting checks failed:");
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.info("Formatting checks passed.");
}
