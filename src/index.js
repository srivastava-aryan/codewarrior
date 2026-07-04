import "dotenv/config";
import express from "express";
import crypto from "crypto";
import { handlePullRequestEvent } from "./webhook-handler.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Webhook Signature Verification ──────────────────────────────────────────
// GitHub signs every webhook payload with HMAC-SHA256 using your webhook secret.
// We MUST verify this before processing anything — otherwise anyone could send
// fake events to your endpoint.

function verifyWebhookSignature(req, rawBody) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const expectedSignature =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// We need the raw body buffer for signature verification, before JSON parsing
app.use((req, res, next) => {
  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", () => {
    req.rawBody = rawBody;
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      req.body = {};
    }
    next();
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — useful for Railway/Fly.io deployment
app.get("/", (req, res) => {
  res.json({ status: "ok", app: "ai-pr-reviewer" });
});

// Main webhook endpoint
app.post("/webhook", async (req, res) => {
  // Verify signature first
  if (!verifyWebhookSignature(req, req.rawBody)) {
    console.warn("[server] Invalid webhook signature — request rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.headers["x-github-event"];
  const deliveryId = req.headers["x-github-delivery"];

  console.log(`[server] Received event: ${event} (delivery: ${deliveryId})`);

  // Respond to GitHub immediately — GitHub expects a response within 10 seconds
  // or it will retry. We process async so we never timeout.
  res.status(202).json({ message: "Accepted" });

  // Process the event asynchronously
  if (event === "pull_request") {
    handlePullRequestEvent(req.body).catch((err) => {
      console.error("[server] Unhandled error in event handler:", err);
    });
  }

  // GitHub periodically sends ping events to verify the webhook is reachable
  if (event === "ping") {
    console.log("[server] Ping received — webhook is configured correctly ✅");
  }
});

// ─── Dev Tunnel Setup ─────────────────────────────────────────────────────────
// In development, we use smee.io to proxy GitHub webhooks to localhost.
// This is only active when WEBHOOK_PROXY_URL is set in .env

async function startSmeeProxy() {
  if (!process.env.WEBHOOK_PROXY_URL) return;

  const { default: SmeeClient } = await import("smee-client");
  const smee = new SmeeClient({
    source: process.env.WEBHOOK_PROXY_URL,
    target: `http://localhost:${PORT}/webhook`,
    logger: console,
  });
  smee.start();
  console.log(`[smee] Proxying webhooks from ${process.env.WEBHOOK_PROXY_URL}`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n🤖 AI PR Reviewer running on port ${PORT}`);
  console.log(`   Webhook endpoint: http://localhost:${PORT}/webhook`);

  // Validate required env vars on startup
  const required = ["GITHUB_APP_ID", "GITHUB_WEBHOOK_SECRET", "GITHUB_PRIVATE_KEY_PATH", "GOOGLE_GEN_AI_API_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`\n⚠️  Missing environment variables: ${missing.join(", ")}`);
    console.warn("   Copy .env.example to .env and fill in the values.\n");
  }

  await startSmeeProxy();
});
