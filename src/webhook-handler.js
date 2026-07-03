import { getInstallationOctokit } from "./github-auth.js";
import { fetchPRFiles, fetchPRMetadata } from "./diff-fetcher.js";
import { generateReview } from "./reviewer.js";
import { postPendingComment, updateComment, postOrUpdateReview } from "./commenter.js";

/**
 * Handles incoming pull_request webhook events.
 *
 * Triggered when a PR is: opened, reopened, or synchronized (new commits pushed).
 * We ignore other actions (labeled, assigned, closed, etc.)
 */
export async function handlePullRequestEvent(payload) {
  const { action, pull_request, repository, installation } = payload;

  // Only review on these actions
  const TRIGGER_ACTIONS = ["opened", "reopened", "synchronize"];
  if (!TRIGGER_ACTIONS.includes(action)) {
    console.log(`[handler] Skipping action: ${action}`);
    return;
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const pull_number = pull_request.number;
  const installationId = installation.id;

  console.log(`[handler] PR #${pull_number} ${action} in ${owner}/${repo}`);

  // Get an Octokit client authenticated as this installation
  const octokit = getInstallationOctokit(installationId);

  // Post a "review in progress" comment immediately so the author gets feedback
  const pendingCommentId = await postPendingComment(octokit, { owner, repo, pull_number });

  try {
    // Fetch PR metadata and changed files in parallel
    const [prMetadata, files] = await Promise.all([
      fetchPRMetadata(octokit, { owner, repo, pull_number }),
      fetchPRFiles(octokit, { owner, repo, pull_number }),
    ]);

    if (files.length === 0) {
      await updateComment(octokit, {
        owner,
        repo,
        comment_id: pendingCommentId,
        body: "## 🤖 AI PR Review\n\n✅ No reviewable files found in this PR (only binary/lock files changed).",
      });
      return;
    }

    console.log(`[handler] Found ${files.length} reviewable file(s)`);

    // Run the AI review pipeline
    const reviewMarkdown = await generateReview(prMetadata, files);

    // Update the pending comment with the real review
    await updateComment(octokit, {
      owner,
      repo,
      comment_id: pendingCommentId,
      body: reviewMarkdown,
    });

    console.log(`[handler] Review posted successfully for PR #${pull_number}`);

  } catch (error) {
    console.error(`[handler] Error reviewing PR #${pull_number}:`, error);

    // Always update the pending comment — never leave it stuck on "in progress"
    await updateComment(octokit, {
      owner,
      repo,
      comment_id: pendingCommentId,
      body: `## 🤖 AI PR Review\n\n❌ Review failed: ${error.message}\n\nPlease check the app logs.`,
    }).catch(console.error);
  }
}
