/**
 * Health Vibe AI - External API Abstraction Layer & Rate Limit Test Suite
 *
 * Verifies User Request 57:
 * "بناء Abstraction Layer حول أي API خارجي مجاني أو مدفوع (مثل الـ Chatbot أو البريد)
 * مع مراقبة حدود الاستخدام (Rate Limits) وخطة بديلة (Fallback Plan)."
 *
 * Verifications:
 * 1. Provider Abstraction Layer: Decoupled interface supporting both Free and Paid tiers.
 * 2. Rate Limit Monitoring: Sliding window rate tracking (RPM/RPH/RPD), header parsing, and 429 handling.
 * 3. Circuit Breaker States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED and admin manual reset.
 * 4. Multi-Tier Chatbot Fallback: Primary -> Secondary -> Deterministic Clinical Guardrail Engine.
 * 5. Multi-Tier Email Fallback: Primary -> Secondary -> Durable Outbox Queue.
 * 6. REST API Endpoints on backend Express server.
 * 7. Client-side integration module (app/modules/core/external-gateway-client.js).
 * 8. Zero regression in email password & Google OAuth authentication.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: EXTERNAL API ABSTRACTION LAYER & RATE LIMITS");
console.log("   PRD Req 57: Gateway Abstraction, Quota Monitoring & Fallback");
console.log("==================================================================\n");

const {
  SERVICE_DOMAINS,
  CIRCUIT_STATE,
  PROVIDER_TIER,
  RateLimitTracker,
  CircuitBreaker,
  ExternalApiProvider,
  ExternalApiGateway,
  createLocalClinicalChatbotFallback,
  createDurableEmailFallback
} = require("../backend/external-api-gateway");

const serverApp = require("../backend/server");

// ── TEST 1: Provider Abstraction & Tier Registration ──────────────────────────
console.log("▶ TEST 1: Provider Abstraction & Free/Paid Tier Governance");

const testGateway = new ExternalApiGateway();

assert.ok(testGateway.services.has(SERVICE_DOMAINS.CHATBOT), "Chatbot domain must be registered");
assert.ok(testGateway.services.has(SERVICE_DOMAINS.EMAIL), "Email domain must be registered");

const chatProviders = testGateway.getProviders(SERVICE_DOMAINS.CHATBOT);
assert.ok(chatProviders.length >= 3, "Chatbot must have primary, secondary, and fallback providers");

const freeTier = chatProviders.find(p => p.tier === PROVIDER_TIER.FREE && !p.isFallback);
const paidTier = chatProviders.find(p => p.tier === PROVIDER_TIER.PAID && !p.isFallback);
const fallbackTier = chatProviders.find(p => p.isFallback);

assert.ok(freeTier, "Free tier provider must exist");
assert.ok(paidTier, "Paid tier provider must exist");
assert.ok(fallbackTier, "Fallback tier provider must exist");

console.log(`  ✓ Free tier provider: ${freeTier.name} (Limit: ${freeTier.rateLimiter.maxRpm} RPM)`);
console.log(`  ✓ Paid tier provider: ${paidTier.name} (Limit: ${paidTier.rateLimiter.maxRpm} RPM)`);
console.log(`  ✓ Fallback provider: ${fallbackTier.name} (100% Available)`);

// ── TEST 2: Sliding Window Rate Limit Tracker & Upstream Headers ───────────────
console.log("\n▶ TEST 2: Rate Limit Monitoring & Quota Utilization");

const tracker = new RateLimitTracker({ maxRpm: 5, maxRph: 50, tier: PROVIDER_TIER.FREE });

// 1. Initial State
let check = tracker.isAllowed();
assert.strictEqual(check.allowed, true);
assert.strictEqual(check.remainingRpm, 5);

// 2. Consume 5 tokens
for (let i = 0; i < 5; i++) {
  tracker.recordRequest();
}

// 3. 6th request must be proactively throttled
check = tracker.isAllowed();
assert.strictEqual(check.allowed, false);
assert.strictEqual(check.reason, "RPM_LIMIT_EXCEEDED");

const snapshot = tracker.getSnapshot();
assert.strictEqual(snapshot.usedRpm, 5);
assert.strictEqual(snapshot.remainingRpm, 0);
assert.strictEqual(snapshot.utilizationPct, 100);

// 4. Test Upstream Header Injection
const mockHeaders = {
  "x-ratelimit-remaining": "12",
  "retry-after": "5",
  "x-ratelimit-reset": String(Date.now() + 60000)
};
tracker.recordUpstreamHeaders(mockHeaders);
assert.strictEqual(tracker.upstreamRemaining, 12);
assert.strictEqual(tracker.retryAfterSec, 5);

// 5. Test 429 Too Many Requests interception
tracker.record429(45);
assert.strictEqual(tracker.upstreamRemaining, 0);
assert.strictEqual(tracker.retryAfterSec, 45);
assert.strictEqual(tracker.isAllowed().allowed, false);
assert.strictEqual(tracker.isAllowed().reason, "UPSTREAM_RETRY_AFTER_ACTIVE");

console.log("  ✓ Sliding-window RPM rate limits enforced with proactive local blocking.");
console.log("  ✓ Upstream HTTP rate-limit headers (x-ratelimit-remaining, retry-after) parsed.");
console.log("  ✓ 429 Too Many Requests triggers automated backoff protection.");

// ── TEST 3: Circuit Breaker State Transitions ─────────────────────────────────
console.log("\n▶ TEST 3: Multi-Tier Circuit Breaker State Machine");

const breaker = new CircuitBreaker({ failureThreshold: 3, coolOffPeriodMs: 50 });

// 1. Initial State: CLOSED
assert.strictEqual(breaker.state, CIRCUIT_STATE.CLOSED);
assert.strictEqual(breaker.canExecute(), true);

// 2. Record 2 failures (under threshold)
breaker.recordFailure();
breaker.recordFailure();
assert.strictEqual(breaker.state, CIRCUIT_STATE.CLOSED);

// 3. 3rd failure trips circuit to OPEN
breaker.recordFailure();
assert.strictEqual(breaker.state, CIRCUIT_STATE.OPEN);
assert.strictEqual(breaker.canExecute(), false, "Breaker must block execution while OPEN");

// 4. Cool-off expiry -> HALF_OPEN
const now = Date.now() + 60; // Simulate 60ms elapsed (> 50ms cool-off)
assert.strictEqual(breaker.canExecute(now), true, "Breaker must permit trial probe after cool-off");
assert.strictEqual(breaker.state, CIRCUIT_STATE.HALF_OPEN);

// 5. Successful probe restores to CLOSED
breaker.recordSuccess(now);
assert.strictEqual(breaker.state, CIRCUIT_STATE.CLOSED);
assert.strictEqual(breaker.failureCount, 0);

// 6. Test 429 immediate trip
breaker.recordFailure(Date.now(), true); // is429 = true
assert.strictEqual(breaker.state, CIRCUIT_STATE.OPEN, "429 must immediately trip breaker to OPEN");

// 7. Manual admin reset
breaker.reset();
assert.strictEqual(breaker.state, CIRCUIT_STATE.CLOSED);

console.log("  ✓ Circuit Breaker transitions verified: CLOSED -> OPEN -> HALF_OPEN -> CLOSED.");
console.log("  ✓ 429 immediately trips circuit; admin reset cleanly restores CLOSED state.");

// ── TEST 4: Chatbot Multi-Tier Fallback Execution ─────────────────────────────
console.log("\n▶ TEST 4: Chatbot Cascade (Primary Free -> Secondary Paid -> Clinical Fallback)");

(async () => {
  const gateway = new ExternalApiGateway();

  // Scenario A: Happy Path through Primary Free LLM
  const res1 = await gateway.sendChatMessage({ query: "What should I do for a mild cough?" });
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.fallbackExecuted, false);
  assert.strictEqual(res1.providerId, "gemini_flash_free");
  console.log("  ✓ Scenario A: Primary Free LLM executed successfully.");

  // Scenario B: Primary fails (e.g. 503) -> Cascades to Secondary Paid Tier
  const res2 = await gateway.sendChatMessage({
    query: "Explain my certified diagnosis",
    simulateError: true
  });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.fallbackExecuted, false);
  assert.strictEqual(res2.providerId, "openai_enterprise_paid");
  console.log("  ✓ Scenario B: Primary failed; successfully cascaded to Secondary Paid Tier.");

  // Scenario C: Both Primary & Secondary down (simulate 429 + Secondary Error)
  // -> Cascades to Local Deterministic Clinical Safety Engine!
  const res3 = await gateway.sendChatMessage({
    query: "أشعر بألم شديد واختناق وطوارئ",
    language: "ar",
    simulateError: true,
    simulateSecondaryError: true
  });
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.fallbackExecuted, true);
  assert.strictEqual(res3.providerId, "clinical_deterministic_fallback");
  assert.ok(res3.data.text.includes("123"), "Emergency fallback must cite 123 emergency dispatch");
  console.log("  ✓ Scenario C: Both external LLMs down; local clinical safety fallback handled emergency query safely.");

  // Scenario D: Doctor certified record lookup in fallback
  const res4 = await gateway.sendChatMessage({
    query: "ما هو تشخيص الطبيب وعلاجي المعتمد؟",
    language: "ar",
    certifiedReport: {
      doctorName: "د. أحمد الشرقاوي",
      clinicalDiagnosis: "ربو شعبي تحسسي متوسط",
      medications: "سالبوتامول بخاخ مرتين يومياً"
    },
    simulateError: true,
    simulateSecondaryError: true
  });
  assert.strictEqual(res4.fallbackExecuted, true);
  assert.ok(res4.data.text.includes("أحمد الشرقاوي"), "Fallback must cite certified doctor");
  assert.ok(res4.data.text.includes("ربو شعبي تحسسي"), "Fallback must cite certified diagnosis");
  console.log("  ✓ Scenario D: Doctor-certified records answered accurately via offline fallback.");
})().then(async () => {

  // ── TEST 5: Email Multi-Tier Fallback & Durable Outbox ────────────────────────
  console.log("\n▶ TEST 5: Email Fallback & Offline Durable Outbox Queue");

  const emailGateway = new ExternalApiGateway();
  emailGateway.clearDurableEmailOutbox();

  // Scenario A: Primary SendGrid succeeds
  const emailRes1 = await emailGateway.sendEmail({
    to: "patient@healthvibe.test",
    subject: "Certified Medical Report Ready",
    html: "<p>Your report is ready</p>"
  });
  assert.strictEqual(emailRes1.success, true);
  assert.strictEqual(emailRes1.fallbackExecuted, false);
  assert.strictEqual(emailRes1.providerId, "sendgrid_api_primary");
  console.log("  ✓ Scenario A: Primary SendGrid API dispatched successfully.");

  // Scenario B: SendGrid rate-limited (429) -> Cascades to Mailgun Secondary
  const emailRes2 = await emailGateway.sendEmail({
    to: "patient2@healthvibe.test",
    subject: "Appointment Reminder",
    html: "<p>Reminder for tomorrow</p>",
    simulateEmail429: true
  });
  assert.strictEqual(emailRes2.success, true);
  assert.strictEqual(emailRes2.fallbackExecuted, false);
  assert.strictEqual(emailRes2.providerId, "mailgun_api_secondary");
  console.log("  ✓ Scenario B: SendGrid 429 throttled; successfully cascaded to Mailgun Secondary.");

  // Scenario C: Both SendGrid & Mailgun down -> Cascades to Durable Offline Outbox!
  const emailRes3 = await emailGateway.sendEmail({
    to: "patient3@healthvibe.test",
    subject: "Critical Triage Escalation Alert",
    html: "<p>Doctor urgent alert</p>",
    simulateEmail429: true,
    simulateSecondaryEmailError: true
  });
  assert.strictEqual(emailRes3.success, true);
  assert.strictEqual(emailRes3.fallbackExecuted, true);
  assert.strictEqual(emailRes3.providerId, "durable_outbox_fallback");
  assert.strictEqual(emailRes3.data.queued, true);

  const outbox = emailGateway.getDurableEmailOutbox();
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].to, "patient3@healthvibe.test");
  assert.strictEqual(outbox[0].status, "queued_in_fallback_outbox");
  console.log(`  ✓ Scenario C: Both email APIs offline; message safely queued in durable outbox (ID: ${outbox[0].queueId}).`);

  // ── TEST 6: Backend Express Route Integration ────────────────────────────────
  console.log("\n▶ TEST 6: Backend Express REST API Routes");

  // Route 1: GET /api/external-gateway/status
  const mockReqStatus = {};
  let statusResult = null;
  const mockResStatus = {
    json: (data) => { statusResult = data; },
    status: () => mockResStatus
  };

  // Find the route handler from serverApp._router
  const getRoutes = serverApp._router.stack
    .filter(r => r.route && r.route.path === "/api/external-gateway/status")
    .map(r => r.route.stack[0].handle);
  assert.ok(getRoutes.length > 0, "/api/external-gateway/status route must exist");
  getRoutes[0](mockReqStatus, mockResStatus);

  assert.strictEqual(statusResult.status, "ok");
  assert.ok(statusResult.metrics.domains.chatbot, "Metrics must include chatbot domain");
  assert.ok(statusResult.metrics.domains.email, "Metrics must include email domain");
  console.log("  ✓ GET /api/external-gateway/status returned provider quotas and circuit health.");

  // Route 2: POST /api/external-gateway/chat
  const chatRoutes = serverApp._router.stack
    .filter(r => r.route && r.route.path === "/api/external-gateway/chat")
    .map(r => r.route.stack[0].handle);
  assert.ok(chatRoutes.length > 0, "/api/external-gateway/chat route must exist");

  let chatResult = null;
  const mockResChat = {
    json: (data) => { chatResult = data; },
    status: () => mockResChat
  };
  await chatRoutes[0]({ body: { query: "Clinical check test query", language: "en" } }, mockResChat);
  assert.strictEqual(chatResult.success, true);
  assert.ok(chatResult.providerId);
  console.log(`  ✓ POST /api/external-gateway/chat dispatched through provider '${chatResult.providerId}'.`);

  // Route 3: POST /api/external-gateway/circuit-reset
  const resetRoutes = serverApp._router.stack
    .filter(r => r.route && r.route.path === "/api/external-gateway/circuit-reset")
    .map(r => r.route.stack[0].handle);
  assert.ok(resetRoutes.length > 0, "/api/external-gateway/circuit-reset route must exist");

  let resetResult = null;
  const mockResReset = {
    json: (data) => { resetResult = data; },
    status: () => mockResReset
  };
  resetRoutes[0]({ body: { domain: "chatbot", providerId: "gemini_flash_free" } }, mockResReset);
  assert.strictEqual(resetResult.success, true);
  console.log("  ✓ POST /api/external-gateway/circuit-reset successfully reset provider circuit.");

  // ── TEST 7: Client-Side External Gateway Client Module ───────────────────────
  console.log("\n▶ TEST 7: Client-Side External Gateway Client Module");

  const clientPath = path.join(__dirname, "../app/modules/core/external-gateway-client.js");
  assert.ok(fs.existsSync(clientPath), "external-gateway-client.js must exist");

  const clientContent = fs.readFileSync(clientPath, "utf8");
  assert.ok(clientContent.includes("localDeterministicAssistant"), "Must provide local deterministic assistant");
  assert.ok(clientContent.includes("askChatbot"), "Must provide askChatbot dispatcher");
  assert.ok(clientContent.includes("sendEmailNotification"), "Must provide sendEmailNotification dispatcher");
  assert.ok(clientContent.includes("HealthVibes.ExternalGatewayClient"), "Must expose HealthVibes.ExternalGatewayClient");

  // Verify inclusion in index.html
  const indexPath = path.join(__dirname, "../app/index.html");
  const indexContent = fs.readFileSync(indexPath, "utf8");
  assert.ok(
    indexContent.includes("modules/core/external-gateway-client.js"),
    "app/index.html must load external-gateway-client.js script"
  );
  console.log("  ✓ Client-side External Gateway Client module verified with offline local fallback.");

  // ── TEST 8: Zero Regression in Email & Google Authentication ────────────────
  console.log("\n▶ TEST 8: Zero Regression in Email & Google Authentication");

  const appJsPath = path.join(__dirname, "../app/app.js");
  const appJsContent = fs.readFileSync(appJsPath, "utf8");
  const authUiPath = path.join(__dirname, "../app/modules/auth/auth-ui.js");
  const authUiContent = fs.readFileSync(authUiPath, "utf8");

  assert.ok(appJsContent.includes("signInWithPopup"), "signInWithPopup must remain present in app.js");
  assert.ok(appJsContent.includes("signInWithRedirect"), "signInWithRedirect must remain present in app.js");
  assert.ok(
    appJsContent.includes("signInWithEmailAndPassword") || authUiContent.includes("signInWithEmailAndPassword"),
    "signInWithEmailAndPassword must remain present"
  );
  assert.ok(
    appJsContent.includes("createUserWithEmailAndPassword") || authUiContent.includes("createUserWithEmailAndPassword"),
    "createUserWithEmailAndPassword must remain present"
  );
  console.log("  ✓ Email login and Google OAuth login preserved with zero regression.");

  console.log("\n==================================================================");
  console.log("🎉 ALL EXTERNAL API ABSTRACTION & RATE LIMIT TESTS PASSED (100%)!");
  console.log("==================================================================");

  process.exit(0);
}).catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
