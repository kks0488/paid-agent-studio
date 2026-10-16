import { stateDouble } from "./state-double.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createQuote,
  createCheckout,
  captureOrder,
  fulfillOrder,
  fulfillVerifiedWebhook,
  getOrder,
  listOrders,
  downloadOrder,
  getConfig,
  qualityCheck,
  canRefund,
  handleWebhook,
  PACKAGES,
} from "../lib/studio.js";
import {
  getValue,
  saveOrder,
  resetMemoryForTests,
  rateLimit,
  withLock,
  withRequestOrders,
} from "../lib/store.js";
import { signJob, verifyJob } from "../lib/tokens.js";
import {
  simulatedOrder,
  validateCapturedOrder,
  validateRefund,
  verifyWebhook,
} from "../lib/paypal.js";

const session = "test-session-owner-0123456789";
const otherSession = "test-session-other-0123456789";
const input = {
  productName: "Daylight Carry",
  facts:
    "500ml capacity\nStainless steel body\nMatte clay finish\nWide opening\nHand wash only",
  packageId: "launch",
};
const envKeys = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_ENV",
  "PAYPAL_BASE_URL",
  "PAYPAL_WEBHOOK_ID",
  "APP_SIGNING_SECRET",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "VERCEL", "STATE_URL", "STATE_SECRET",
];
let env;
beforeEach(() => {
  env = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  envKeys.forEach((key) => delete process.env[key]);
  resetMemoryForTests();
});
afterEach(() => {
  mock.restoreAll();
  for (const key of envKeys)
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
});
const response = (data) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

async function paid(overrides = {}) {
  const quote = await createQuote({ ...input, ...overrides }, session);
  const checkout = await createCheckout(quote.id, session);
  return captureOrder(quote.id, session, { paypalOrderId: checkout.id });
}

async function sandboxOrder() {
  const quote = await createQuote(input, session);
  const order = await getValue("order:" + quote.id);
  order.paymentMode = "sandbox";
  order.status = "awaiting_payment";
  order.paypalOrderId = "PPORDER00000000001";
  await saveOrder(order);
  process.env.STATE_URL = "https://state.test/state";
  process.env.STATE_SECRET = "test-state-secret";
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
  process.env.PAYPAL_ENV = "sandbox";
  process.env.APP_SIGNING_SECRET = "test-persistent-sandbox-signing-key";
  process.env.PAYPAL_WEBHOOK_ID = "test-webhook-id";
  return order;
}

function mockPayPal(handler) {
  const calls = [];
  const state = stateDouble();
  mock.method(globalThis, "fetch", async (url, options = {}) => {
    const local = state(url, options);
    if (local) return local;
    const path = new URL(url).pathname;
    if (path === "/v1/oauth2/token")
      return response({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 300,
      });
    calls.push({ path, ...options });
    if (/^\/v2\/payments\/captures\/[^/]+$/.test(path)) {
      const order = (await import("../lib/store.js")).requestOrders().find(o => o.paypalOrderId);
      return response({ id: order.captureId || simulatedOrder(order, true).purchase_units[0].payments.captures[0].id,
        status: "COMPLETED", amount: { value: order.amount, currency_code: order.currency } });
    }
    if (path.startsWith("/v2/checkout/orders/") && options.method === "GET") {
      const order = (await import("../lib/store.js")).requestOrders().find(o => o.paypalOrderId);
      if (order?.refundId || (order?.qcAttempts.length === 2 && !order.qcAttempts.some(q => q.passed))) return response(simulatedOrder(order, true));
    }
    return response(await handler(path, options));
  });
  return calls;
}

const webhookHeaders = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.paypal.com/v1/notifications/certs/test",
  "paypal-transmission-id": "test-transmission",
  "paypal-transmission-sig": "test-signature",
  "paypal-transmission-time": "2026-10-16T00:00:00Z",
};
const captureEvent = (order) => ({
  id: "WH-TEST-CAPTURE-EVENT",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: simulatedOrder(order, true).purchase_units[0].payments.captures[0].id,
    status: "COMPLETED",
    amount: { currency_code: order.currency, value: order.amount },
    custom_id: order.id,
    supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
  },
});

test("pricing is server authoritative for all packages; ignores hostile client amounts", async () => {
  for (const [packageId, expected] of [
    ["starter", "19.00"],
    ["launch", "39.00"],
    ["growth", "69.00"],
  ]) {
    const quote = await createQuote(
      { ...input, packageId, amount: "0.01", currency: "EUR" },
      session,
    );
    assert.equal(quote.amount, expected);
    assert.equal(quote.currency, "USD");
    assert.equal(quote.status, "quoted");
    assert.equal(quote.sessionId, undefined);
    assert.equal(quote.paymentMode, "simulated");
  }
  assert.deepEqual(Object.keys(PACKAGES), ["starter", "launch", "growth"]);
});

test("bounds, package, scenario and session validation reject invalid input", async () => {
  for (const change of [
    { facts: "tiny" },
    { facts: "a".repeat(6001) },
    { productName: "" },
    { productName: "x".repeat(121) },
    { packageId: "free" },
    { scenario: "unknown" },
  ])
    await assert.rejects(
      createQuote({ ...input, ...change }, session),
      (error) => error.status === 400,
    );
  await assert.rejects(
    createQuote(input, "bad"),
    (error) => error.status === 401,
  );
});

test("configuration clearly labels demo and storage modes and rejects live PayPal environment", () => {
  assert.deepEqual(getConfig(), {
    paymentMode: "simulated",
    aiMode: "demo",
    paypalClientId: null,
    storageMode: "paypal-signed-receipts",
    liveReady: false,
  });
  process.env.PAYPAL_ENV = "live";
  assert.throws(getConfig, (error) => error.code === "SANDBOX_ONLY");
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_BASE_URL = "https://api-m.paypal.com";
  assert.throws(getConfig, (error) => error.code === "SANDBOX_ONLY");
  delete process.env.PAYPAL_BASE_URL;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  assert.throws(getConfig, (error) => error.code === "PAYPAL_CONFIGURATION");
});

test("complete simulated state machine delivers scoped package and paid downloads", async () => {
  const quote = await createQuote(input, session);
  await assert.rejects(
    fulfillOrder(quote.id, session),
    (error) => error.code === "PAYMENT_REQUIRED",
  );
  await assert.rejects(
    captureOrder(quote.id, session),
    (error) => error.code === "INVALID_STATE",
  );
  await assert.rejects(
    downloadOrder(quote.id, session, "json"),
    (error) => error.code === "NOT_DELIVERED",
  );
  const checkout = await createCheckout(quote.id, session);
  assert.match(checkout.id, /^[A-Za-z0-9]{17}$/);
  assert.equal((await getOrder(quote.id, session)).status, "awaiting_payment");
  await assert.rejects(
    captureOrder(quote.id, session, { paypalOrderId: "different" }),
    (error) => error.code === "PAYMENT_MISMATCH",
  );
  const captured = await captureOrder(quote.id, session, {
    paypalOrderId: checkout.id,
  });
  assert.equal(captured.status, "paid");
  assert.equal(captured.capturedAmount, "39.00");
  const delivered = await fulfillOrder(quote.id, session);
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.qcAttempts.length, 1);
  assert.equal(delivered.qcAttempts[0].passed, true);
  assert.deepEqual(Object.keys(delivered.bundle), ["pdp", "ads", "shorts"]);
  assert.match(delivered.bundle.pdp.subheadline, /500ml/);
  const json = await downloadOrder(quote.id, session, "json");
  assert.deepEqual(JSON.parse(json.body), delivered.bundle);
  assert.match(json.contentType, /application\/json/);
  const md = await downloadOrder(quote.id, session, "markdown");
  assert.match(md.body, /# Daylight Carry/);
  assert.match(md.body, /## Shorts script/);
  assert.doesNotMatch(md.body, /## Thumbnail/);
  assert.equal((await listOrders(session)).length, 1);
  assert.deepEqual(
    delivered.timeline
      .filter((t) => ["create_order", "get_order", "capture"].includes(t.tool))
      .map((t) => t.tool),
    ["create_order", "get_order", "capture"],
  );
});

test("Starter contains only detail page; Growth contains all purchased sections", async () => {
  for (const packageId of ["starter", "growth"]) {
    const order = await paid({ packageId });
    const delivered = await fulfillOrder(order.id, session);
    assert.equal(delivered.status, "delivered");
    assert.deepEqual(
      Object.keys(delivered.bundle),
      PACKAGES[packageId].sections,
    );
    const md = await downloadOrder(order.id, session);
    assert.equal(md.body.includes("## Ad copy"), packageId === "growth");
  }
});

test("session tenancy prevents order reads, capture, fulfillment, checkout and downloads", async () => {
  const order = await paid();
  for (const action of [
    getOrder,
    createCheckout,
    captureOrder,
    fulfillOrder,
    downloadOrder,
  ])
    await assert.rejects(
      action(order.id, otherSession),
      (error) => error.status === 404,
    );
  assert.deepEqual(await listOrders(otherSession), []);
});

test("two failed QC attempts issue exactly one full refund and withhold bundle", async () => {
  const order = await paid({ scenario: "guarantee" });
  const result = await fulfillOrder(order.id, session);
  assert.equal(result.status, "refunded");
  assert.equal(result.refundedAmount, "39.00");
  assert.equal(result.bundle, null);
  assert.equal(result.qcAttempts.length, 2);
  assert.equal(
    result.qcAttempts.every((qc) => !qc.passed),
    true,
  );
  assert.equal(result.timeline.filter((t) => t.tool === "refund").length, 1);
  assert.match(
    result.timeline.find((t) => t.tool === "refund").path,
    /\/v2\/payments\/captures\/.+\/refund/,
  );
  const { jobToken: firstToken, ...first } = result;
  const { jobToken: retryToken, ...retry } = await fulfillOrder(order.id, session);
  assert.deepEqual(retry, first);
  await assert.rejects(
    downloadOrder(order.id, session),
    (error) => error.code === "NOT_DELIVERED",
  );
});

test("duplicate concurrent checkout, capture and fulfill operations mutate once", async () => {
  const order = await createQuote(input, session);
  const checkouts = await Promise.all(
    Array.from({ length: 6 }, () => createCheckout(order.id, session)),
  );
  assert.equal(new Set(checkouts.map((v) => v.id)).size, 1);
  await Promise.all(
    Array.from({ length: 6 }, () => captureOrder(order.id, session)),
  );
  await Promise.all(
    Array.from({ length: 6 }, () => fulfillOrder(order.id, session)),
  );
  const result = await getOrder(order.id, session);
  for (const tool of ["create_order", "capture", "generate_bundle", "deliver"])
    assert.equal(
      result.timeline.filter((t) => t.tool === tool).length,
      1,
      tool,
    );
});

test("concurrent guarantee requests issue a single refund", async () => {
  const order = await paid({ scenario: "guarantee" });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => fulfillOrder(order.id, session)),
  );
  assert.equal(
    results.every((result) => result.status === "refunded"),
    true,
  );
  assert.equal(
    results[0].timeline.filter((t) => t.tool === "refund").length,
    1,
  );
});

test("refund guard refuses unpaid, successful, already refunded and malformed states", () => {
  const order = {
    captureId: "CAPTURE",
    amount: "39.00",
    capturedAmount: "39.00",
    refundedAmount: "0.00",
    refundId: null,
    status: "generating",
    qcAttempts: [{ passed: false }, { passed: false }],
  };
  assert.equal(canRefund(order), true);
  for (const change of [
    { captureId: null },
    { capturedAmount: "19.00" },
    { refundedAmount: "39.00" },
    { refundId: "existing" },
    { status: "quoted" },
    { qcAttempts: [{ passed: false }] },
    { qcAttempts: [{ passed: true }, { passed: false }] },
  ])
    assert.equal(canRefund({ ...order, ...change }), false);
});

test("crash between refund pending persistence and PayPal call resumes safely", async () => {
  const order = await paid({ scenario: "guarantee" });
  const stored = await getValue("order:" + order.id);
  stored.status = "refund_pending";
  stored.qcAttempts = [
    { attempt: 1, passed: false, issues: ["risk"] },
    { attempt: 2, passed: false, issues: ["risk"] },
  ];
  await saveOrder(stored);
  const result = await fulfillOrder(order.id, session);
  assert.equal(result.status, "refunded");
  assert.equal(result.timeline.filter((t) => t.tool === "refund").length, 1);
});

test("QC detects unsupported numbers, material facts, factual assertions and risky claims", () => {
  const order = { ...input, amount: "39.00" };
  for (const claim of [
    "Clinically proven to cure every illness",
    "Holds 900ml",
    "Made from bamboo",
    "Includes a lifetime warranty",
  ]) {
    const bundle = {
      pdp: {
        headline: input.productName,
        subheadline: claim,
        bullets: ["500ml capacity"],
        description: ["Hand wash only"],
      },
      ads: { headlines: ["Explore"] },
      shorts: { scenes: [{ time: "0-3s" }] },
    };
    assert.equal(qualityCheck(bundle, order).passed, false, claim);
  }
});

test("capture validation rejects wrong order, currency, amount, identity, status and duplicate captures", () => {
  const order = {
    id: "ORDER",
    paypalOrderId: "PPORDER",
    amount: "39.00",
    currency: "USD",
  };
  const good = simulatedOrder(order, true);
  assert.equal(validateCapturedOrder(good, order).status, "COMPLETED");
  for (const mutate of [
    (data) => {
      data.id = "OTHER";
    },
    (data) => {
      data.status = "APPROVED";
    },
    (data) => {
      data.purchase_units[0].custom_id = "OTHER";
    },
    (data) => {
      data.purchase_units[0].amount.value = "0.01";
    },
    (data) => {
      data.purchase_units[0].payments.captures[0].amount.currency_code = "EUR";
    },
    (data) => {
      data.purchase_units[0].payments.captures[0].amount.value = "19.00";
    },
    (data) => {
      data.purchase_units[0].payments.captures[0].status = "PENDING";
    },
    (data) => {
      data.purchase_units[0].payments.captures.push(
        data.purchase_units[0].payments.captures[0],
      );
    },
  ]) {
    const data = structuredClone(good);
    mutate(data);
    assert.throws(
      () => validateCapturedOrder(data, order),
      (error) => error.code === "PAYMENT_MISMATCH",
    );
  }
});

test("refund confirmation rejects partial/wrong-currency/failed responses", () => {
  const order = { currency: "USD", capturedAmount: "39.00" };
  for (const bad of [
    {
      id: "REF",
      status: "COMPLETED",
      amount: { value: "19.00", currency_code: "USD" },
    },
    {
      id: "REF",
      status: "COMPLETED",
      amount: { value: "39.00", currency_code: "EUR" },
    },
    {
      id: "REF",
      status: "FAILED",
      amount: { value: "39.00", currency_code: "USD" },
    },
  ])
    assert.throws(
      () => validateRefund(bad, order),
      (error) => error.code === "REFUND_MISMATCH",
    );
});

test("known pending Sandbox refund reconciles without issuing another refund", async () => {
  const order = await sandboxOrder();
  const captured = simulatedOrder(order, true).purchase_units[0].payments
    .captures[0];
  order.status = "generating";
  order.captureId = captured.id;
  order.capturedAmount = order.amount;
  order.qcAttempts = [
    { attempt: 1, passed: false, issues: ["unsupported fact"] },
    { attempt: 2, passed: false, issues: ["unsupported fact"] },
  ];
  await saveOrder(order);
  const calls = mockPayPal(async (path) => ({
    id: "REFUND00000000001",
    status: path.endsWith("/refund") ? "PENDING" : "COMPLETED",
    amount: { currency_code: "USD", value: "39.00" },
  }));
  order.status = "refund_pending";
  await saveOrder(order);
  const { stateRequest } = await import("../lib/fulfillment.js");
  const { jobDigest } = await import("../lib/tokens.js");
  await stateRequest("cas", "job:" + order.id, {version: 0, value: {binding: [order.id, order.jobNonce, order.paypalOrderId, order.captureId, jobDigest(order)].join(":"), order}});
  const pending = await fulfillOrder(order.id, session);
  assert.equal(pending.status, "refund_pending");
  assert.equal(pending.refundedAmount, "0.00");
  const completed = await fulfillOrder(order.id, session);
  assert.equal(completed.status, "refunded");
  assert.equal(completed.refundedAmount, "39.00");
  assert.equal(
    calls.filter(
      (call) => call.method === "POST" && call.path.endsWith("/refund"),
    ).length,
    1,
  );
  assert.equal(
    calls.find((call) => call.method === "POST").headers["PayPal-Request-Id"],
    "pas-refund-" + order.id,
  );
});

test("known failed Sandbox refund stays failed and does not repeat refund POST", async () => {
  const order = await sandboxOrder();
  order.status = "refund_failed";
  order.refundId = "REFUND00000000001";
  order.captureId = "CAPTURE00000000001";
  order.capturedAmount = order.amount;
  order.qcAttempts = [
    { attempt: 1, passed: false, issues: ["unsupported fact"] },
    { attempt: 2, passed: false, issues: ["unsupported fact"] },
  ];
  await saveOrder(order);
  const calls = mockPayPal(async (path) => {
    assert.match(path, /\/v2\/payments\/refunds\//);
    return { id: order.refundId, status: "FAILED" };
  });
  const { stateRequest } = await import("../lib/fulfillment.js");
  const { jobDigest } = await import("../lib/tokens.js");
  await stateRequest("cas", "job:" + order.id, {version: 0, value: {binding: [order.id, order.jobNonce, order.paypalOrderId, order.captureId, jobDigest(order)].join(":"), order}});
  const result = await fulfillOrder(order.id, session);
  assert.equal(result.status, "refund_failed");
  assert.equal(
    calls.every((call) => call.method === "GET"),
    true,
  );
  assert.match(result.timeline.at(-1).summary, /seller must resolve/);
});

test("verified refund webhook reconciles an existing pending refund and records replay", async () => {
  const order = await sandboxOrder();
  order.status = "refund_pending";
  order.refundId = "REFUND00000000001";
  order.captureId = "CAPTURE00000000001";
  order.capturedAmount = order.amount;
  await saveOrder(order);
  mockPayPal(async (path) =>
    path.endsWith("verify-webhook-signature")
      ? { verification_status: "SUCCESS" }
      : {
          id: order.refundId,
          status: "COMPLETED",
          amount: { currency_code: "USD", value: "39.00" },
        },
  );
  const event = {
    id: "WH-REFUND-COMPLETED",
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    resource: {
      id: order.refundId,
      status: "COMPLETED",
      amount: { currency_code: "USD", value: "39.00" },
    },
  };
  const result = await handleWebhook(webhookHeaders, event);
  assert.equal(result.status, "refunded");
  assert.equal((await getOrder(order.id, session)).refundedAmount, "39.00");
  assert.equal((await handleWebhook(webhookHeaders, event)).duplicate, true);
});

test("Sandbox checkout requires signing secret; Sandbox guarantee test is allowed", async () => {
  const order = await sandboxOrder();
  delete process.env.APP_SIGNING_SECRET;
  await assert.rejects(
    createCheckout(order.id, session),
    (error) => error.code === "SANDBOX_NOT_READY",
  );
  process.env.APP_SIGNING_SECRET = "test-persistent-sandbox-signing-key";
  const quote = await createQuote({ ...input, scenario: "guarantee" }, session);
  assert.equal(quote.paymentMode, "sandbox");
  assert.equal(quote.scenario, "guarantee");
  assert.equal(getConfig().liveReady, true);
});

test("Sandbox capture retries use stable idempotency key and validated remote details", async () => {
  const order = await sandboxOrder();
  const calls = mockPayPal(async (path) =>
    path.endsWith("/capture")
      ? simulatedOrder(order, true)
      : simulatedOrder(order, false),
  );
  const result = await captureOrder(order.id, session);
  assert.equal(result.status, "paid");
  assert.equal(
    calls.find((call) => call.path.endsWith("/capture")).headers[
      "PayPal-Request-Id"
    ],
    "pas-capture-" + order.id,
  );
  await captureOrder(order.id, session);
  assert.equal(
    calls.filter((call) => call.path.endsWith("/capture")).length,
    1,
  );
});

test("Sandbox capture mismatch never unlocks delivery", async () => {
  const order = await sandboxOrder();
  const bad = simulatedOrder(order, true);
  bad.purchase_units[0].payments.captures[0].amount.value = "0.01";
  mockPayPal(async () => bad);
  await assert.rejects(
    captureOrder(order.id, session),
    (error) => error.code === "PAYMENT_MISMATCH",
  );
  assert.equal((await getOrder(order.id, session)).status, "awaiting_payment");
});

test("webhook signature must verify remotely before any order mutation", async () => {
  const order = await sandboxOrder();
  const calls = mockPayPal(async (path) => {
    assert.equal(path, "/v1/notifications/verify-webhook-signature");
    return { verification_status: "FAILURE" };
  });
  await assert.rejects(
    handleWebhook(webhookHeaders, captureEvent(order)),
    (error) => error.code === "INVALID_WEBHOOK" && error.status === 401,
  );
  assert.equal((await getOrder(order.id, session)).status, "awaiting_payment");
  assert.equal(calls.length, 1);
  await assert.rejects(
    verifyWebhook({}, captureEvent(order)),
    (error) => error.code === "INVALID_WEBHOOK",
  );
});

test("verified capture webhook independently reconciles payment; replays and concurrency are idempotent", async () => {
  const order = await sandboxOrder();
  const calls = mockPayPal(async (path) =>
    path.endsWith("verify-webhook-signature")
      ? { verification_status: "SUCCESS" }
      : simulatedOrder(order, true),
  );
  const event = captureEvent(order);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => handleWebhook(webhookHeaders, event)),
  );
  assert.equal(results.filter((result) => result.duplicate).length, 3);
  const stored = await getOrder(order.id, session);
  assert.equal(stored.status, "paid");
  assert.equal(stored.captureId, event.resource.id);
  assert.equal(
    calls.filter((call) => call.path.includes("/v2/checkout/orders/")).length,
    1,
  );
  await fulfillOrder(order.id, session);
  const replay = { ...event, id: "WH-ANOTHER-SIGNED-EVENT" };
  await handleWebhook(webhookHeaders, replay);
  assert.equal((await getOrder(order.id, session)).status, "delivered");
});

test("a signed but mismatched capture webhook cannot mark payment confirmed", async () => {
  const order = await sandboxOrder();
  mockPayPal(async (path) =>
    path.endsWith("verify-webhook-signature")
      ? { verification_status: "SUCCESS" }
      : simulatedOrder(order, true),
  );
  const event = captureEvent(order);
  event.resource.amount.value = "1.00";
  await assert.rejects(
    handleWebhook(webhookHeaders, event),
    (error) => error.code === "PAYMENT_MISMATCH",
  );
  assert.equal((await getOrder(order.id, session)).status, "awaiting_payment");
});

test("verified webhook server continuation fulfills paid Sandbox order without browser request", async () => {
  const order = await sandboxOrder();
  mockPayPal(async (path) =>
    path.endsWith("verify-webhook-signature")
      ? { verification_status: "SUCCESS" }
      : simulatedOrder(order, true),
  );
  const result = await handleWebhook(webhookHeaders, captureEvent(order));
  assert.equal(result.status, "paid");
  const delivered = await fulfillVerifiedWebhook(result.orderId);
  assert.equal(delivered.status, "delivered");
  assert.equal(
    delivered.timeline.find((t) => t.tool === "verify_webhook").method,
    "POST",
  );
  assert.equal(
    delivered.timeline.find((t) => t.tool === "verify_webhook").path,
    "/v1/notifications/verify-webhook-signature",
  );
  assert.equal(await fulfillVerifiedWebhook(result.orderId), null);
  const replay = await handleWebhook(webhookHeaders, captureEvent(order));
  assert.equal(replay.duplicate, true);
  assert.equal(replay.orderId, order.id);
  assert.equal(replay.status, "delivered");
});

test("webhook simulation never accepts fabricated success signatures", async () => {
  await assert.rejects(
    handleWebhook(webhookHeaders, {
      id: "fake",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
    }),
    (error) => error.code === "WEBHOOK_CONFIGURATION",
  );
});

test("rate limiter enforces the chosen count and memory lock releases after error", async () => {
  await rateLimit("rate-test", 2);
  await rateLimit("rate-test", 2);
  await assert.rejects(
    rateLimit("rate-test", 2),
    (error) => error.status === 429,
  );
  await assert.rejects(
    withLock("release-test", () => {
      throw new Error("expected");
    }),
    /expected/,
  );
  assert.equal(await withLock("release-test", () => 42), 42);
});

test("signed receipts recover after memory reset and request orders stay isolated", async () => {
  const paidOrder = await paid();
  const delivered = await fulfillOrder(paidOrder.id, session);
  const receipt = await getValue("order:" + delivered.id);
  const token = signJob(receipt);
  resetMemoryForTests();
  assert.equal(await getValue("order:" + receipt.id), null);
  const recovered = verifyJob(token, session);
  await Promise.all([
    withRequestOrders([recovered], async () => {
      assert.equal((await getOrder(receipt.id, session)).status, "delivered");
      assert.deepEqual(JSON.parse((await downloadOrder(receipt.id, session, "json")).body), delivered.bundle);
      const changed = { ...recovered, status: "refunded" };
      await saveOrder(changed);
      assert.equal((await getValue("order:" + receipt.id)).status, "refunded");
    }),
    withRequestOrders([recovered], async () => {
      await Promise.resolve();
      assert.equal((await getValue("order:" + receipt.id)).status, "delivered");
    }),
    withRequestOrders([], async () => {
      assert.equal(await getValue("order:" + receipt.id), null);
      await assert.rejects(getOrder(receipt.id, session), (error) => error.status === 404);
    }),
  ]);
  assert.equal(await getValue("order:" + receipt.id), null);
  assert.equal(getConfig().storageMode, "paypal-signed-receipts");
});

test("Nebius client disables thinking, parses final JSON and never uses reasoning_content", async () => {
  const { callLLM, finalContent, jsonObject } = await import("../lib/content-core.js");
  let sent;
  const result = await callLLM({
    provider: "nebius", apiKey: "test-only", system: "/no_think Return JSON", user: "test", jsonMode: true, detailed: true,
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return response({ choices: [{ message: { content: '<think>{"wrong":true}</think>Result: {"ok":true}', reasoning_content: 'private' }, finish_reason: "stop" }], usage: { total_tokens: 42 } });
    },
  });
  assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: false });
  assert.equal(sent.response_format.type, "json_object");
  assert.deepEqual(jsonObject(result.text), { ok: true });
  assert.equal(result.usage.total_tokens, 42);
  assert.equal(finalContent("<think>unfinished private output"), "");
  await assert.rejects(callLLM({ provider: "nebius", apiKey: "test-only", fetchImpl: async () => response({ choices: [{ message: { content: null, reasoning_content: "private" } }] }) }), /no text/);
});

test("LLM timeout aborts the request and redacts secrets from provider failures", async () => {
  const { callLLM } = await import("../lib/content-core.js");
  await assert.rejects(callLLM({ provider: "nebius", apiKey: "test-only", timeoutMs: 10, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) }), /timed out/);
  await assert.rejects(callLLM({ provider: "nebius", apiKey: "test-only", fetchImpl: async () => { throw new Error("failed test-only"); } }), /failed \[redacted\]/);
});

test("live quote records actual model usage and retains authoritative fixed price", async () => {
  process.env.LLM_API_KEY = "test-only";
  mock.method(globalThis, "fetch", async () => response({ model: "nvidia/Nemotron-3_5-Lightning", choices: [{ message: { content: "<think>private</think>A practical launch package for the supplied product." }, finish_reason: "stop" }], usage: { total_tokens: 75 } }));
  const quote = await createQuote(input, session);
  assert.equal(quote.quoteMode, "live");
  assert.equal(quote.amount, "39.00");
  assert.doesNotMatch(quote.quoteExplanation, /private|think/);
  assert.equal(quote.llmUsage[0].usage.total_tokens, 75);
});

test("provider failure visibly falls back to fixtures for simulated orders", async () => {
  process.env.LLM_API_KEY = "test-only";
  mock.method(globalThis, "fetch", async () => { throw new Error("unavailable"); });
  const quote = await createQuote(input, session);
  assert.equal(quote.quoteMode, "demo");
  assert.match(quote.aiNotice, /Live AI quote unavailable/);
  const checkout = await createCheckout(quote.id, session);
  await captureOrder(quote.id, session, { paypalOrderId: checkout.id });
  const delivered = await fulfillOrder(quote.id, session);
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.aiMode, "demo");
  assert.match(delivered.aiNotice, /deterministic demo fixtures/);
});


test("QC treats FAQ questions as questions while still rejecting invented numbers and materials", async () => {
  const delivered = await fulfillOrder((await paid()).id, session);
  const bundle = structuredClone(delivered.bundle);
  bundle.pdp.faq.push({ question: "What is it made from?", answer: "Stainless steel body" });
  bundle.pdp.faq.push({ question: "What is its capacity?", answer: "500ml capacity" });
  assert.equal(qualityCheck(bundle, input).passed, true);
  bundle.pdp.faq.push({ question: "Does its 900ml capacity suit you?", answer: "[needs info]" });
  assert.equal(qualityCheck(bundle, input).passed, false);
});


test("live content requests enforce the purchased JSON schema and required array sizes", async () => {
  const {callLLM,bundleResponseSchema}=await import("../lib/content-core.js");
  const schema=bundleResponseSchema(["pdp","ads","shorts"]);
  assert.deepEqual(schema.required,["pdp","ads","shorts"]);
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.pdp.properties.faq.minItems,3);
  assert.equal(schema.properties.ads.properties.headlines.minItems,3);
  assert.equal(schema.properties.shorts.properties.scenes.minItems,4);
  let body;
  await callLLM({provider:"nebius",apiKey:"test-only",jsonSchema:schema,fetchImpl:async (_url,options)=>{
    body=JSON.parse(options.body);
    return response({choices:[{message:{content:'{"ok":true}'},finish_reason:"stop"}]});
  }});
  assert.equal(body.response_format.type,"json_schema");
  assert.equal(body.response_format.json_schema.strict,true);
  assert.deepEqual(body.response_format.json_schema.schema,schema);
});


test("stale signed paid receipt recovers delivery after process reset without regenerating or refunding", async () => {
  const order = await sandboxOrder();
  const calls = mockPayPal(async () => simulatedOrder(order, true));
  const paidOrder = await captureOrder(order.id, session);
  const stale = verifyJob(paidOrder.jobToken, session);
  const delivered = await fulfillOrder(order.id, session);
  assert.equal(delivered.status, "delivered");
  await downloadOrder(order.id, session);
  resetMemoryForTests();
  const recovered = await withRequestOrders([stale], () => fulfillOrder(order.id, session));
  assert.deepEqual(recovered.bundle, delivered.bundle);
  assert.equal(recovered.status, "delivered");
  assert.ok(recovered.acceptedAt);
  assert.equal(calls.filter(c => c.path.endsWith("/refund")).length, 0);
  assert.equal(recovered.qcAttempts.length, delivered.qcAttempts.length);
});

test("atomic nonce claim allows one cold-instance runner and blocks interrupted replay", async () => {
  const order = await sandboxOrder();
  mockPayPal(async () => simulatedOrder(order, true));
  const paidOrder = verifyJob((await captureOrder(order.id, session)).jobToken, session);
  const { claimFulfillment } = await import("../lib/fulfillment.js");
  const results = await Promise.allSettled([claimFulfillment(paidOrder), claimFulfillment(paidOrder)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  resetMemoryForTests();
  assert.equal((await withRequestOrders([paidOrder], () => getOrder(order.id,session))).status,"generating");
  await assert.rejects(withRequestOrders([paidOrder], () => fulfillOrder(order.id, session)), { code: "NONCE_USED" });
});

test("capture binding rejects another nonce and legacy receipts cannot start generation", async () => {
  const order = await sandboxOrder();
  mockPayPal(async () => simulatedOrder(order, true));
  const paidOrder = verifyJob((await captureOrder(order.id, session)).jobToken, session);
  const { claimFulfillment } = await import("../lib/fulfillment.js");
  await claimFulfillment(paidOrder);
  await assert.rejects(claimFulfillment({ ...paidOrder, jobNonce: "other-nonce" }), { code: "NONCE_MISMATCH" });
  await assert.rejects(claimFulfillment({ ...paidOrder, captureId: "SECOND-CAPTURE" }), { code: "NONCE_MISMATCH" });
  const legacy = { ...paidOrder }; delete legacy.jobNonce;
  await assert.rejects(claimFulfillment(legacy), { code: "LEGACY_RECEIPT" });
});

test("durable outage fails closed before generation or refund", async () => {
  const order = await sandboxOrder();
  mockPayPal(async () => simulatedOrder(order, true));
  const paidOrder = verifyJob((await captureOrder(order.id, session)).jobToken, session);
  delete process.env.STATE_URL;
  const { claimFulfillment } = await import("../lib/fulfillment.js");
  await assert.rejects(claimFulfillment(paidOrder), { code: "STATE_UNAVAILABLE" });
});

test("QC rejects unfinished copy and exaggerated English and Korean claims", async () => {
  const order = await paid();
  const delivered = await fulfillOrder(order.id, session);
  for (const claim of ["[needs info]", "[확인 필요]", "The best bag", "완벽한 품질을 보장해요"] ) {
    const bundle = structuredClone(delivered.bundle); bundle.pdp.subheadline = claim;
    assert.equal(qualityCheck(bundle, order).passed, false);
  }
});

test("delivery and acceptance markers block refunds even if an older status is restored", async () => {
  const order = await paid();
  const failed = { ...order, status: "refund_pending", qcAttempts: [{ passed:false }, { passed:false }] };
  assert.equal(canRefund(failed), true);
  for (const marker of ["deliveredAt", "acceptedAt"])
    assert.equal(canRefund({ ...failed, [marker]:new Date().toISOString() }), false);
});

test("QC catches benefit inventions and unfinished Korean sentences seen in live drafts", async () => {
  const order = await paid();
  const delivered = await fulfillOrder(order.id, session);
  for (const claim of ["The strap allows a customized fit.", "Adjustable strap for custom fit.", "Hand wash only to maintain the canvas.", "Capacity for daily essentials.", "Spacious interior."]) {
    const bundle = structuredClone(delivered.bundle); bundle.pdp.description[0] = claim;
    assert.equal(qualityCheck(bundle, order).passed, false);
  }
  const korean = structuredClone(delivered.bundle);
  korean.pdp.description = ["면 캔버스 소재", "조절 가능한 스트랩이 특징", "손세탁만 가능"];
  const result = qualityCheck(korean, { ...order, language:"Korean" });
  assert.ok(result.issues.filter(i => i.includes("complete Korean sentence")).length >= 3);
  const care = structuredClone(delivered.bundle);
  care.shorts.scenes[0].visual = "Hand being washed";
  assert.ok(qualityCheck(care, order).issues.some(i => i.includes("Misread product care")));
});

test("stale capture receipt after accepted delivery recovers the result without recapturing", async () => {
  const order = await sandboxOrder();
  const calls = mockPayPal(async () => simulatedOrder(order, true));
  const paidOrder = await captureOrder(order.id, session);
  const stale = verifyJob(paidOrder.jobToken, session);
  const delivered = await fulfillOrder(order.id, session);
  await downloadOrder(order.id, session);
  resetMemoryForTests();
  const result = await withRequestOrders([stale], () => captureOrder(order.id, session));
  assert.equal(result.status, "delivered");
  assert.ok(result.acceptedAt);
  assert.deepEqual(result.bundle, delivered.bundle);
  assert.equal(calls.filter(c => c.path.endsWith("/capture") || c.path.endsWith("/refund")).length, 0);
});

test("a changed remote capture cannot replace the capture bound into a signed receipt", async () => {
  const order = await sandboxOrder();
  let changed = false;
  const calls = mockPayPal(async () => {
    const remote = simulatedOrder(order, true);
    if (changed) remote.purchase_units[0].payments.captures[0].id = "ANOTHER-CAPTURE";
    return remote;
  });
  const stale = verifyJob((await captureOrder(order.id, session)).jobToken, session);
  changed = true;
  resetMemoryForTests();
  await assert.rejects(withRequestOrders([stale], () => fulfillOrder(order.id, session)), { code:"PAYMENT_MISMATCH" });
  assert.equal(calls.filter(c => c.path.endsWith("/refund")).length, 0);
});

test("live corrective generation changes only rejected copy fields and preserves the approved draft", async () => {
  const seed = await paid();
  const original = (await fulfillOrder(seed.id, session)).bundle;
  const order = await paid();
  const stored = await getValue("order:"+order.id);
  stored.aiMode = "live";
  await saveOrder(stored);
  process.env.LLM_API_KEY = "test-correction-key";
  let calls=0;
  mock.method(globalThis,"fetch",async (_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    const draft=structuredClone(original);
    draft.pdp.description[0]="Comfortable for all-day use.";
    if (calls===2) assert.deepEqual(body.response_format.json_schema.schema.required,["text"]);
    return response({choices:[{message:{content:JSON.stringify(calls===1?draft:{text:"The body is stainless steel."})}}]});
  });
  const result=await fulfillOrder(order.id,session);
  assert.equal(result.status,"delivered");
  assert.equal(result.aiMode,"live");
  assert.equal(calls,2);
  const expected=structuredClone(original); expected.pdp.description[0]="The body is stainless steel.";
  assert.deepEqual(result.bundle,expected);
});

test("one correction failure waits for the other model requests before completing the job", async () => {
  const seed=await paid(); const draft=(await fulfillOrder(seed.id,session)).bundle;
  draft.pdp.description[0]="Comfortable."; draft.ads.bodies[0]="Roomy interior.";
  const order=await paid(); const stored=await getValue("order:"+order.id);
  stored.aiMode="live"; await saveOrder(stored); process.env.LLM_API_KEY="test-correction-key";
  let release,started,calls=0;
  const slow=new Promise(resolve=>{release=resolve;});
  const waiting=new Promise(resolve=>{started=resolve;});
  mock.method(globalThis,"fetch",async()=>{
    calls++;
    if(calls===1)return response({choices:[{message:{content:JSON.stringify(draft)}}]});
    if(calls===2)throw new Error("Provider unavailable");
    started(); await slow;
    return response({choices:[{message:{content:JSON.stringify({text:"The body is stainless steel."})}}]});
  });
  const result=fulfillOrder(order.id,session);
  await waiting; await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await getValue("order:"+order.id)).status,"generating");
  release();
  assert.equal((await result).status,"delivered");
});
