import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, parse, relative, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const environmentPath = resolve(repositoryRoot, ".env");

try {
  loadEnvFile(environmentPath);
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

function isSameOrWithin(candidate, parent) {
  const pathFromParent = relative(parent, candidate);

  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

function assertSafeUploadRoot(candidate, options) {
  const { publicDirectory, repositoryDirectory, relativeConfiguration } =
    options;

  if (candidate === parse(candidate).root) {
    throw new Error("UPLOAD_ROOT must not be a filesystem root.");
  }

  if (candidate === repositoryDirectory) {
    throw new Error("UPLOAD_ROOT must not be the repository root.");
  }

  if (isSameOrWithin(candidate, publicDirectory)) {
    throw new Error(
      "UPLOAD_ROOT must not be inside apps/web/public; uploads require authorized API access.",
    );
  }

  if (
    relativeConfiguration &&
    !isSameOrWithin(candidate, repositoryDirectory)
  ) {
    throw new Error(
      "A relative UPLOAD_ROOT must stay inside the repository. Use an explicit absolute path for external storage.",
    );
  }
}

export async function prepareLocalStorage(environment = process.env) {
  const configuredRoot = environment.UPLOAD_ROOT?.trim() || "./var/uploads";
  const relativeConfiguration = !isAbsolute(configuredRoot);
  const requestedRoot = resolve(repositoryRoot, configuredRoot);
  const publicDirectory = resolve(repositoryRoot, "apps/web/public");

  assertSafeUploadRoot(requestedRoot, {
    publicDirectory,
    repositoryDirectory: repositoryRoot,
    relativeConfiguration,
  });

  try {
    const requestedRootStats = await lstat(requestedRoot);

    if (requestedRootStats.isSymbolicLink()) {
      throw new Error("UPLOAD_ROOT must not be a symbolic link.");
    }

    if (!requestedRootStats.isDirectory()) {
      throw new Error("UPLOAD_ROOT exists but is not a directory.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    await mkdir(requestedRoot, { mode: 0o750, recursive: true });
  }

  const [actualRoot, actualRepositoryRoot, actualPublicDirectory] =
    await Promise.all([
      realpath(requestedRoot),
      realpath(repositoryRoot),
      realpath(publicDirectory),
    ]);

  assertSafeUploadRoot(actualRoot, {
    publicDirectory: actualPublicDirectory,
    repositoryDirectory: actualRepositoryRoot,
    relativeConfiguration,
  });

  return actualRoot;
}

const preparedRoot = await prepareLocalStorage();
console.log(`Local upload directory ready: ${preparedRoot}`);
