import { stateDouble } from "./state-double.js";
import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/[...path]/route.js";
import { resetMemoryForTests, withRequestOrders } from "../lib/store.js";
import { jobDigest, verifyJob } from "../lib/tokens.js";
import { handleWebhook, fulfillVerifiedWebhook } from "../lib/studio.js";
import { storedCheckout, rememberCheckout } from "../lib/fulfillment.js";

const invoke = (handler, path, options = {}) =>
  handler(new Request(`https://studio.example/api/${path}`, options), {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });

test("HTTP route flow uses session, rejects client price and locks downloads until delivery", async () => {
  const config = await invoke(GET, "config");
  assert.equal(config.status, 200);
  const cookie = config.headers.get("set-cookie").split(";")[0];
  const headers = {
    cookie,
    "content-type": "application/json",
    origin: "https://studio.example",
  };
  const created = await invoke(POST, "orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      productName: "Plain canvas bag",
      facts: "Cotton canvas; sand color; hand wash only.",
      packageId: "starter",
      amount: "0.01",
    }),
  });
  assert.equal(created.status, 201);
  const { order } = await created.json();
  assert.equal(order.amount, "19.00");
  assert.equal(order.sessionId, undefined);
  assert.equal((await invoke(GET, `orders/${order.id}`)).status, 404);
  assert.equal(
    (await invoke(GET, `orders/${order.id}/download`, { headers })).status,
    409,
  );
  assert.equal(
    (
      await invoke(POST, `orders/${order.id}/fulfill`, {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    409,
  );
  const checkout = await (
    await invoke(POST, `orders/${order.id}/checkout`, {
      method: "POST",
      headers,
      body: "{}",
    })
  ).json();
  const captured = await invoke(POST, `orders/${order.id}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ paypalOrderId: checkout.id }),
  });
  assert.equal((await captured.json()).order.status, "paid");
  const delivered = await invoke(POST, `orders/${order.id}/fulfill`, {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal((await delivered.json()).order.status, "delivered");
  const file = await invoke(GET, `orders/${order.id}/download`, { headers });
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /attachment/);
  assert.match(await file.text(), /Plain canvas bag/);
  assert.equal(
    (await invoke(GET, `orders/${order.id}/download?format=exe`, { headers }))
      .status,
    400,
  );
});

test("unsigned webhook cannot mutate demo orders", async () => {
  const result = await invoke(POST, "webhooks/paypal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "WH-test",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {},
    }),
  });
  assert.equal(result.status, 503);
});

async function withSandboxRoutes(t, action) {
  const keys = ["PAYPAL_ENV", "PAYPAL_BASE_URL", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "STATE_URL", "STATE_SECRET", "PAYPAL_WEBHOOK_ID", "APP_SIGNING_SECRET", "LLM_API_KEY"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    PAYPAL_ENV: "sandbox",
    PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
    STATE_URL: "https://state.test/state", STATE_SECRET: "test-state-secret",
    PAYPAL_CLIENT_ID: "routes-sandbox-client",
    PAYPAL_CLIENT_SECRET: "routes-sandbox-secret",
    PAYPAL_WEBHOOK_ID: "routes-sandbox-webhook",
    APP_SIGNING_SECRET: "routes-persistent-signing-key",
  });
  delete process.env.LLM_API_KEY;
  resetMemoryForTests();
  const calls = [];
  const state = { remote: null, refund: null };
  const json = value => Response.json(value);
  const durable = stateDouble();
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const local = durable(url, options); if (local) return local;
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api-m.sandbox.paypal.com", "tests must never contact a live endpoint");
    calls.push({ path: parsed.pathname, method: options.method, body: options.body });
    if (parsed.pathname === "/v1/oauth2/token") return json({ access_token: "routes-test-access-token", expires_in: 300 });
    if (parsed.pathname === "/v1/notifications/verify-webhook-signature") return json({ verification_status: "SUCCESS" });
    if (parsed.pathname === "/v2/checkout/orders" && options.method === "POST") {
      state.remote = { ...JSON.parse(options.body), id: "PPROUTESORDER00001", status: "CREATED", links: [] };
      return json(state.remote);
    }
    if (parsed.pathname === "/v2/checkout/orders/PPROUTESORDER00001" && options.method === "GET") return json(state.remote);
    if (parsed.pathname === "/v2/payments/captures/PPROUTESCAPTURE001") return json(state.remote.purchase_units[0].payments.captures[0]);
    if (parsed.pathname === "/v2/payments/refunds/PPROUTESREFUND001" && options.method === "GET" && state.refund) return json(state.refund);
    assert.fail(`Unexpected mocked request: ${options.method} ${parsed.pathname}`);
  });
  try {
    await action({ state, calls });
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetMemoryForTests();
  }
}

async function signedSandboxCheckout() {
  const config = await invoke(GET, "config");
  assert.equal(config.status, 200);
  const cookie = config.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "content-type": "application/json", origin: "https://studio.example" };
  const created = await invoke(POST, "orders", {
    method: "POST", headers,
    body: JSON.stringify({ productName: "Plain canvas bag", facts: "Cotton canvas; sand color; hand wash only.", packageId: "starter", amount: "0.01" }),
  });
  assert.equal(created.status, 201);
  const quoted = (await created.json()).order;
  assert.equal(quoted.amount, "19.00");
  assert.equal(quoted.paymentMode, "sandbox");
  const result = await invoke(POST, `orders/${quoted.id}/checkout`, {
    method: "POST", headers: { ...headers, "x-job-token": quoted.jobToken }, body: "{}",
  });
  assert.equal(result.status, 200);
  const checkout = await result.json();
  assert.equal(checkout.id, "PPROUTESORDER00001");
  return { order: checkout.order, headers: { ...headers, "x-job-token": checkout.order.jobToken } };
}

function completeRemoteOrder(state, status = "COMPLETED") {
  state.remote.status = "COMPLETED";
  state.remote.purchase_units[0].payments = {
    captures: [{ id: "PPROUTESCAPTURE001", status, amount: { currency_code: "USD", value: "19.00" } }],
  };
}

test("Sandbox HTTP receipt survives process reset and checks remote job identity and exact payment", async (t) => {
  await withSandboxRoutes(t, async ({ state, calls }) => {
    const { order, headers } = await signedSandboxCheckout();
    const spec = verifyJob(order.jobToken);
    assert.equal(state.remote.purchase_units[0].custom_id, order.id);
    assert.equal(state.remote.purchase_units[0].invoice_id, `pas-${order.id}-${jobDigest(spec).slice(0, 32)}`);
    completeRemoteOrder(state);
    resetMemoryForTests();
    const recovered = await invoke(GET, `orders/${order.id}`, { headers });
    assert.equal(recovered.status, 200);
    const paid = (await recovered.json()).order;
    assert.equal(paid.status, "paid");
    assert.equal(paid.captureId, "PPROUTESCAPTURE001");
    assert.equal(paid.capturedAmount, "19.00");
    assert.ok(calls.some(call => call.path === "/v2/checkout/orders/PPROUTESORDER00001" && call.method === "GET"));
    const validRemote = structuredClone(state.remote);
    for (const corrupt of [
      remote => { remote.purchase_units[0].custom_id = "another-job"; },
      remote => { remote.purchase_units[0].invoice_id += "changed"; },
      remote => { remote.purchase_units[0].amount.value = "0.01"; },
      remote => { remote.purchase_units[0].amount.value = "19.0"; },
      remote => { remote.purchase_units[0].amount.currency_code = "EUR"; },
      remote => { remote.purchase_units[0].payments.captures[0].amount.value = "0.01"; },
      remote => { remote.purchase_units[0].payments.captures[0].amount.currency_code = "EUR"; },
    ]) {
      state.remote = structuredClone(validRemote);
      corrupt(state.remote);
      const mismatch = await invoke(GET, `orders/${order.id}`, { headers });
      assert.equal(mismatch.status, 409);
      assert.match((await mismatch.json()).error, /match/);
    }
  });
});

test("Sandbox HTTP rejects missing, foreign-owner and modified receipts before remote access", async (t) => {
  await withSandboxRoutes(t, async ({ calls }) => {
    const { order, headers } = await signedSandboxCheckout();
    resetMemoryForTests();
    const initialCalls = calls.length;
    const missing = { ...headers };
    delete missing["x-job-token"];
    assert.equal((await invoke(GET, `orders/${order.id}`, { headers: missing })).status, 404);
    const foreign = { ...headers, cookie: `studio_session=${"a".repeat(64)}` };
    assert.equal((await invoke(GET, `orders/${order.id}`, { headers: foreign })).status, 401);
    const parts = order.jobToken.split(".");
    parts[1] = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
    const modified = { ...headers, "x-job-token": parts.join(".") };
    assert.equal((await invoke(GET, `orders/${order.id}`, { headers: modified })).status, 401);
    assert.equal(calls.length, initialCalls);
  });
});

test("Sandbox rollback to a signed awaiting receipt cannot unlock refunded downloads", async (t) => {
  await withSandboxRoutes(t, async ({ state, calls }) => {
    const { order, headers } = await signedSandboxCheckout();
    assert.equal(order.status, "awaiting_payment");
    completeRemoteOrder(state, "REFUNDED");
    state.remote.purchase_units[0].payments.refunds = [{ id: "PPROUTESREFUND001" }];
    state.refund = { id: "PPROUTESREFUND001", status: "COMPLETED", amount: { currency_code: "USD", value: "19.00" } };
    resetMemoryForTests();
    const recovered = await invoke(GET, `orders/${order.id}`, { headers });
    assert.equal(recovered.status, 200);
    const refunded = (await recovered.json()).order;
    assert.equal(refunded.status, "refunded");
    assert.equal(refunded.refundId, "PPROUTESREFUND001");
    assert.equal(refunded.refundedAmount, "19.00");
    assert.equal(refunded.bundle, null);
    const file = await invoke(GET, `orders/${order.id}/download`, { headers });
    assert.equal(file.status, 409);
    assert.match((await file.json()).error, /not available for download/i);
    assert.ok(calls.some(call => call.path === "/v2/payments/refunds/PPROUTESREFUND001"));
    assert.equal(calls.filter(call => call.method === "POST" && call.path !== "/v1/oauth2/token").length, 1);
  });
});

test("ledger drops invalid/expired/foreign receipts while preserving valid jobs", async (t) => {
  await withSandboxRoutes(t, async ({state}) => {
    const {order,headers} = await signedSandboxCheckout();
    completeRemoteOrder(state);
    const bare={...headers}; delete bare["x-job-token"];
    const result=await invoke(POST,"ledger",{method:"POST",headers:bare,body:JSON.stringify({tokens:["v1.invalid.invalid",order.jobToken]})});
    assert.equal(result.status,200);
    const rows=(await result.json()).orders;
    assert.equal(rows.length,1);
    assert.equal(rows[0].id,order.id);
    const foreign={...bare,cookie:`studio_session=${"f".repeat(64)}`};
    const empty=await invoke(POST,"ledger",{method:"POST",headers:foreign,body:JSON.stringify({tokens:[order.jobToken]})});
    assert.equal(empty.status,200);
    assert.deepEqual((await empty.json()).orders,[]);
  });
});

const signedWebhookHeaders = {
  "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert/test",
  "paypal-transmission-id": "test-transmission", "paypal-transmission-sig": "test-signature",
  "paypal-transmission-time": "2026-10-16T00:00:00Z",
};
const completedEvent = () => ({ id: "WH-STATELESS-CAPTURE", event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "PPROUTESCAPTURE001", status: "COMPLETED", amount: { currency_code: "USD", value: "19.00" },
    supplementary_data: { related_ids: { order_id: "PPROUTESORDER00001" } } } });
const productionWebhook = event => withRequestOrders([], () => handleWebhook(signedWebhookHeaders, event));

test("production webhook restores immutable checkout after cold start and delivers without browser fulfillment", async (t) => {
  await withSandboxRoutes(t, async ({ state, calls }) => {
    const { order, headers } = await signedSandboxCheckout();
    completeRemoteOrder(state);
    resetMemoryForTests();
    const event = completedEvent();
    const handoff = await productionWebhook(event);
    assert.equal(handoff.orderId, order.id);
    assert.equal(handoff.status, "paid");
    // Run outside request context, as a serverless post-response continuation may do.
    resetMemoryForTests();
    const delivered = await fulfillVerifiedWebhook(handoff.orderId);
    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.timeline.filter(item => item.tool === "generate_bundle").length, 1);
    assert.equal(delivered.timeline.filter(item => item.eventId === event.id).length, 1);
    const replay = await productionWebhook(event);
    assert.equal(replay.status, "delivered");
    const again = await fulfillVerifiedWebhook(replay.orderId);
    assert.deepEqual(again.bundle, delivered.bundle);
    assert.equal(again.timeline.filter(item => item.tool === "generate_bundle").length, 1);
    assert.equal((await storedCheckout(order.id)).value.events.length, 1);
    const recovered = (await (await invoke(GET, `orders/${order.id}`, { headers })).json()).order;
    assert.equal(recovered.status, "delivered");
    assert.equal(recovered.timeline.filter(item => item.eventId === event.id).length, 1);
    assert.equal((await invoke(GET, `orders/${order.id}/download`, { headers })).status, 200);
    assert.equal(calls.filter(call => call.path.endsWith("/capture") || call.path.endsWith("/refund")).length, 0);
  });
});

test("production webhook and browser fulfillment race claims generation once", async (t) => {
  await withSandboxRoutes(t, async ({ state }) => {
    const { order, headers } = await signedSandboxCheckout();
    completeRemoteOrder(state);
    const handoff = await productionWebhook(completedEvent());
    const [continued, browser] = await Promise.all([
      fulfillVerifiedWebhook(handoff.orderId),
      invoke(POST, `orders/${order.id}/fulfill`, { method: "POST", headers, body: "{}" }),
    ]);
    assert.equal(continued.status, "delivered");
    assert.equal(browser.status, 200);
    const result = (await browser.json()).order;
    assert.equal(result.timeline.filter(item => item.tool === "generate_bundle").length, 1);
    assert.deepEqual(result.bundle, continued.bundle);
  });
});

test("checkout replay preserves binding and production webhook rejects a mismatched signed-job digest", async (t) => {
  await withSandboxRoutes(t, async ({ state }) => {
    const { order, headers } = await signedSandboxCheckout();
    const original = await storedCheckout(order.id);
    assert.equal((await invoke(POST, `orders/${order.id}/checkout`, { method: "POST", headers, body: "{}" })).status, 200);
    assert.deepEqual(await storedCheckout(order.id), original);
    const receipt = verifyJob(order.jobToken);
    await assert.rejects(rememberCheckout({ ...receipt, jobNonce: "another-nonce" }), { code: "NONCE_MISMATCH" });
    completeRemoteOrder(state);
    state.remote.purchase_units[0].invoice_id += "wrong-digest";
    await assert.rejects(productionWebhook(completedEvent()), { code: "PAYMENT_MISMATCH" });
    assert.deepEqual(await storedCheckout(order.id), original);
  });
});

test("production approval webhook records no generation handoff before capture", async (t) => {
  await withSandboxRoutes(t, async () => {
    const { order } = await signedSandboxCheckout();
    const result = await productionWebhook({ id: "WH-APPROVED", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "PPROUTESORDER00001" } });
    assert.equal(result.verified, true);
    assert.equal(result.orderId, undefined);
    assert.equal((await storedCheckout(order.id)).value.events.length, 0);
  });
});
