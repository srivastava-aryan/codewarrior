import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import fs from "fs";

/**
 * Returns an Octokit instance authenticated as a specific installation.
 * GitHub Apps authenticate in two layers:
 *   1. App-level JWT (signed with private key) — used to get an installation token
 *   2. Installation-level token — scoped to a specific repo/org install
 *
 * Octokit's createAppAuth handles both steps automatically.
 */
export function getInstallationOctokit(installationId) {
  const privateKey =
    process.env.GITHUB_PRIVATE_KEY ||
    fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8");

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey,
      installationId,
    },
  });
}
