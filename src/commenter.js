const REVIEW_MARKER = "<!-- ai-pr-reviewer -->";

/**
 * Posts the AI review as a PR comment, or updates an existing one if the bot
 * already commented (e.g. on a force push). This prevents comment spam.
 *
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {object} params
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {number} params.pull_number
 * @param {string} params.reviewMarkdown
 */
export async function postOrUpdateReview(octokit, { owner, repo, pull_number, reviewMarkdown }) {
  // The marker is a hidden HTML comment that lets us find our own comments later
  const body = `${REVIEW_MARKER}\n${reviewMarkdown}`;

  // Check if we already commented on this PR
  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: pull_number,
    per_page: 100,
  });

  const existingComment = comments.find((c) => c.body?.includes(REVIEW_MARKER));

  if (existingComment) {
    // Update the existing comment instead of creating a new one
    console.log(`[commenter] Updating existing review comment (id: ${existingComment.id})`);
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    console.log(`[commenter] Posting new review comment`);
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body,
    });
  }
}

/**
 * Posts a "review in progress" placeholder comment so the PR author knows
 * the bot is working. Returns the comment ID so we can update it later.
 */
export async function postPendingComment(octokit, { owner, repo, pull_number }) {
  const body = `${REVIEW_MARKER}\n## 🤖 AI PR Review\n\n⏳ Review in progress...`;

  const { data: comment } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body,
  });

  return comment.id;
}

/**
 * Updates the pending comment with the final review (or an error message).
 */
export async function updateComment(octokit, { owner, repo, comment_id, body }) {
  await octokit.issues.updateComment({
    owner,
    repo,
    comment_id,
    body: `${REVIEW_MARKER}\n${body}`,
  });
}
