# 🤖 AI PR Reviewer

A GitHub App that automatically reviews pull requests using LangChain and Google Gemini. When a PR is opened or updated, the app fetches the diff, analyzes each changed file with an LLM, and posts a structured review comment — issues, suggestions, and a merge verdict.

**[Live Demo](#)** · **[GitHub App Install](#)**

---

## How It Works

```
Developer opens PR
       │
       ▼
GitHub sends pull_request webhook
       │
       ▼
Express server verifies HMAC-SHA256 signature
       │
       ▼
Post "⏳ Review in progress..." comment immediately
       │
       ▼
Fetch PR metadata + changed file diffs (Octokit)
       │
       ▼
Filter out binary/lock/generated files
       │
       ▼
Review each file in parallel (LangChain + OpenAI)
  ├── File 1 → issues, suggestions, verdict
  ├── File 2 → issues, suggestions, verdict
  └── File N → ...
       │
       ▼
Synthesize all file reviews into one cohesive summary
       │
       ▼
Update PR comment with final structured review
```

## Example Output

```markdown
## 🤖 AI PR Review

### Summary
This PR adds JWT authentication middleware and a user login endpoint.
The core logic looks solid but there are a few security issues worth
addressing before merging.

### Issues Found
- `src/middleware/auth.js`: JWT secret is hardcoded as a string literal
  on line 12 — should be read from `process.env.JWT_SECRET`
- `src/routes/auth.js`: Password comparison uses `==` instead of a
  constant-time function like `bcrypt.compare()` — vulnerable to timing attacks

### Suggestions
- `src/middleware/auth.js`: Consider adding token expiry validation
- `src/routes/auth.js`: Add rate limiting to the `/login` endpoint

### Verdict
🚨 **Needs Major Changes**
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Web server | Express |
| GitHub API | Octokit REST |
| AI pipeline | LangChain + Google Gemini |
| Dev tunnel | smee.io |
| Deployment | Render / Fly.io |

---

## Setup

### 1. Create the GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **Name**: `ai-pr-reviewer` (or anything)
   - **Homepage URL**: your repo URL
   - **Webhook URL**: `https://your-domain.com/webhook` (use smee.io for local dev — see step 4)
   - **Webhook secret**: generate a random string and save it
3. Set **Repository permissions**:
   - Pull requests: **Read & Write**
   - Issues: **Read & Write** (for posting comments)
4. Subscribe to events: **Pull request**
5. Create the app, then on the next page:
   - Note your **App ID**
   - Click **Generate a private key** — this downloads a `.pem` file

### 2. Install the app on a repo

On your app's page, click **Install App** and select the repo(s) to monitor.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in:

```env
GITHUB_APP_ID=123456
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_PRIVATE_KEY_PATH=./private-key.pem   # move your .pem here
GEMINI_API_KEY=sk-...
GEMINI_MODEL=gpt-4o-mini
PORT=3000
WEBHOOK_PROXY_URL=https://smee.io/abc123    # for local dev only
```

### 4. Set up a dev tunnel (local development)

GitHub needs a public URL to send webhooks. We use [smee.io](https://smee.io) as a free proxy:

1. Go to [smee.io/new](https://smee.io/new) — you'll get a unique URL like `https://smee.io/abc123`
2. Set that as `WEBHOOK_PROXY_URL` in your `.env`
3. Go back to your GitHub App settings and set the **Webhook URL** to the same smee URL
4. The app will automatically start the smee proxy when `WEBHOOK_PROXY_URL` is set

### 5. Install dependencies and run

```bash
npm install
npm run dev
```

Open a PR on any repo the app is installed on. You should see the review comment appear within ~15 seconds.

---
---

## Technical Decisions

**Why parallel file reviews instead of sending the full diff to one LLM call?**

Large PRs can easily exceed 4,000 tokens in their diff. Sending the full diff as one prompt risks hitting context limits, produces unfocused reviews, and makes the model's attention diffuse across many files. By reviewing each file independently and then synthesizing, each review call stays focused and the synthesis step can weigh findings across files to write a coherent summary.

**Why smee.io over ngrok for local dev?**

smee.io is purpose-built for webhook proxying and has a Node.js client (`smee-client`) that integrates directly into the server process — no separate terminal window needed. ngrok works too and has a nicer UI, but requires a separate process and a free account for stable URLs.

**Why HMAC-SHA256 signature verification before any processing?**

Without verification, anyone who discovers your webhook URL can send arbitrary payloads to trigger AI calls (costing you money) or inject malicious data. GitHub signs every request with your webhook secret, and `crypto.timingSafeEqual` prevents timing-based attacks on the comparison.

**Why post a "pending" comment immediately, then update it?**

The AI review takes 10–30 seconds. If we waited until the review was ready to post anything, the PR author would see no feedback and wonder if the app is working. Posting immediately and updating gives instant visual confirmation that the review is running.

**Why `temperature: 0.2` for the LLM?**

Code review needs consistency and factuality, not creativity. Low temperature keeps the model focused on concrete issues rather than hallucinating problems.

---

## Project Structure

```
ai-pr-reviewer/
├── src/
│   ├── index.js            # Express server + webhook routing
│   ├── github-auth.js      # GitHub App authentication (JWT + installation tokens)
│   ├── diff-fetcher.js     # Fetch and parse PR diffs via Octokit
│   ├── reviewer.js         # LangChain pipeline — file review + synthesis
│   └── commenter.js        # Post/update PR comments
├── .env.example
├── package.json
└── README.md
```

---

## License

MIT
