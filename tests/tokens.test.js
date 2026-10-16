import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { signJob, verifyJob, jobDigest } from "../lib/tokens.js";

const envKeys = ["APP_SIGNING_SECRET", "PAYPAL_ENV", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"];
let env;
beforeEach(() => {
  env = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  envKeys.forEach((key) => delete process.env[key]);
});
afterEach(() => {
  for (const key of envKeys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});
const order = () => ({
  id: "job-123", sessionId: "owner-session", productName: "Daylight Carry",
  facts: "500ml capacity", packageId: "launch", amount: "9.00", currency: "USD",
  scenario: "success", createdAt: "2026-10-16T00:00:00.000Z", paymentMode: "simulated",
  bundle: { headline: "A bright new day", descriptions: ["Carry what matters."] },
  paypalOrderId: "SANDBOX123", captureId: "CAPTURE123", status: "DELIVERED",
});
const invalid = (error) => error.code === "INVALID_JOB_TOKEN";

test("signed receipt preserves bundle and owner while removing nested token", () => {
  const receipt = order();
  const token = signJob({ ...receipt, jobToken: "old-token" });
  assert.deepEqual(verifyJob(token, receipt.sessionId), receipt);
  assert.deepEqual(verifyJob(token), receipt);
});

test("tampering, changed signing keys and wrong owner are rejected", () => {
  process.env.APP_SIGNING_SECRET = "test-signing-key-1";
  const token = signJob(order());
  const parts = token.split(".");
  parts[1] = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
  assert.throws(() => verifyJob(parts.join(".")), invalid);
  assert.throws(() => verifyJob(token, "other-session"), invalid);
  process.env.APP_SIGNING_SECRET = "test-signing-key-2";
  assert.throws(() => verifyJob(token), invalid);
});

test("sandbox cannot sign or verify without a persistent signing secret", () => {
  assert.throws(() => signJob({ ...order(), paymentMode: "sandbox" }), { code: "SIGNING_CONFIGURATION" });
  process.env.PAYPAL_CLIENT_ID = "test-client";
  assert.throws(() => signJob(order()), { code: "SIGNING_CONFIGURATION" });
  assert.throws(() => verifyJob("invalid"), { code: "SIGNING_CONFIGURATION" });
  process.env.APP_SIGNING_SECRET = "test-sandbox-persistent-key";
  const receipt = { ...order(), paymentMode: "sandbox" };
  assert.deepEqual(verifyJob(signJob(receipt), receipt.sessionId), receipt);
});

test("receipts expire after 30 days and cannot be used before issuance", () => {
  const now = 1_800_000_000_000;
  const token = signJob(order(), { now });
  assert.deepEqual(verifyJob(token, undefined, { now: now + 29 * 86400000 }), order());
  assert.throws(() => verifyJob(token, undefined, { now: now + 30 * 86400000 }), invalid);
  assert.throws(() => verifyJob(token, undefined, { now: now - 1 }), invalid);
});

test("token size and inflated receipt limits are enforced", () => {
  assert.throws(() => verifyJob("x".repeat(80 * 1024 + 1)), invalid);
  assert.throws(() => signJob({ ...order(), bundle: "x".repeat(200 * 1024) }), invalid);
  assert.throws(() => signJob({ ...order(), bundle: randomBytes(90 * 1024).toString("base64") }), invalid);
  for (const token of [null, "", "v1.bad.bad", "v2.a.b"]) assert.throws(() => verifyJob(token), invalid);
});

test("immutable spec digest is stable and binds price, package and owner", () => {
  const receipt = order();
  const digest = jobDigest(receipt);
  assert.equal(jobDigest({ ...receipt, status: "REFUNDED", bundle: { headline: "changed" } }), digest);
  assert.equal(jobDigest(Object.fromEntries(Object.entries(receipt).reverse())), digest);
  for (const change of [{ amount: "1.00" }, { packageId: "other" }, { sessionId: "other" }, { facts: "other" }]) {
    assert.notEqual(jobDigest({ ...receipt, ...change }), digest);
  }
});
