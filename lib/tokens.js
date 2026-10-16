import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { StudioError } from "./store.js";

const ephemeralSecret = randomBytes(32);
const MAX_ENCODED = 80 * 1024;
const MAX_DECODED = 200 * 1024;
const LIFETIME = 30 * 24 * 60 * 60 * 1000;
const PURPOSE = "paid-agent-studio-job";

function secret(order) {
  if (process.env.APP_SIGNING_SECRET) return process.env.APP_SIGNING_SECRET;
  if (
    process.env.PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_SECRET ||
    order?.paymentMode === "sandbox"
  ) {
    throw new StudioError("Sandbox requires APP_SIGNING_SECRET.", 503, "SIGNING_CONFIGURATION");
  }
  return ephemeralSecret;
}

const invalid = () => new StudioError("Job token is invalid or expired.", 401, "INVALID_JOB_TOKEN");
const mac = (value, key) => createHmac("sha256", key).update(value).digest();
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};

export function jobDigest(order) {
  const keys = ["id", "sessionId", "productName", "facts", "packageId", "amount", "currency", "scenario", "createdAt", ...(order.jobNonce ? ["jobNonce", "language"] : [])];
  const spec = Object.fromEntries(keys.map((key) => [key, order[key]]));
  return createHash("sha256").update(JSON.stringify(canonical(spec))).digest("hex");
}

export function signJob(order, { now = Date.now() } = {}) {
  const key = secret(order);
  if (!order || typeof order !== "object" || Array.isArray(order) || !Number.isFinite(now)) throw invalid();
  // The entire receipt, including the delivered bundle and owner binding, travels with the client.
  const { jobToken, ...receipt } = order;
  const raw = Buffer.from(JSON.stringify({ purpose: PURPOSE, version: 1, issuedAt: now, expiresAt: now + LIFETIME, order: receipt }));
  if (raw.length > MAX_DECODED) throw invalid();
  const payload = "v1." + deflateRawSync(raw).toString("base64url");
  const token = payload + "." + mac(payload, key).toString("base64url");
  if (Buffer.byteLength(token) > MAX_ENCODED) throw invalid();
  return token;
}

export function verifyJob(token, sessionId, { now = Date.now() } = {}) {
  const key = secret();
  try {
    if (typeof token !== "string" || Buffer.byteLength(token) > MAX_ENCODED || !Number.isFinite(now)) throw invalid();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1" || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) throw invalid();
    const provided = Buffer.from(parts[2], "base64url");
    const expected = mac(parts[0] + "." + parts[1], key);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw invalid();
    const raw = inflateRawSync(Buffer.from(parts[1], "base64url"), { maxOutputLength: MAX_DECODED });
    const value = JSON.parse(raw.toString("utf8"));
    if (
      value.purpose !== PURPOSE || value.version !== 1 ||
      !Number.isFinite(value.issuedAt) || !Number.isFinite(value.expiresAt) ||
      value.issuedAt > now || value.expiresAt <= now ||
      value.expiresAt - value.issuedAt !== LIFETIME ||
      !value.order || typeof value.order !== "object" || Array.isArray(value.order) ||
      (sessionId !== undefined && value.order.sessionId !== sessionId)
    ) throw invalid();
    return value.order;
  } catch {
    throw invalid();
  }
}
