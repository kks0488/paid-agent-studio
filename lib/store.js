import { randomUUID } from "node:crypto";

const memory = (globalThis.__paidAgentStore ||= {
  values: new Map(),
  queues: new Map(),
  limits: new Map(),
});
const prefix = "paid-agent-studio:v1:";
const clone = (value) => (value == null ? value : structuredClone(value));

export class StudioError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message);
    this.name = "StudioError";
    this.status = status;
    this.code = code;
  }
}

export function isDurable() {
  return Boolean(process.env.REDIS_REST_URL && process.env.REDIS_REST_TOKEN);
}

async function redis(command) {
  const url = new URL(process.env.REDIS_REST_URL);
  if (url.protocol !== "https:")
    throw new StudioError(
      "Storage configuration is invalid.",
      503,
      "STORAGE_UNAVAILABLE",
    );
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error();
    return data.result;
  } catch {
    throw new StudioError(
      "Order storage is temporarily unavailable. Please retry.",
      503,
      "STORAGE_UNAVAILABLE",
    );
  }
}

export async function getValue(key) {
  if (!isDurable()) return clone(memory.values.get(key) ?? null);
  const value = await redis(["GET", prefix + key]);
  return value ? JSON.parse(value) : null;
}

export async function setValue(key, value) {
  if (!isDurable()) {
    memory.values.set(key, clone(value));
    return;
  }
  await redis(["SET", prefix + key, JSON.stringify(value)]);
}

export async function withLock(key, action) {
  if (!isDurable()) {
    const previous = memory.queues.get(key) || Promise.resolve();
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    memory.queues.set(key, next);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (memory.queues.get(key) === next) memory.queues.delete(key);
    }
  }
  // The lease exceeds the bounded two-attempt generation and payment request timeouts.
  const lockKey = prefix + "lock:" + key,
    token = randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    acquired = (await redis(["SET", lockKey, token, "NX", "EX", 300])) === "OK";
    if (acquired) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!acquired)
    throw new StudioError(
      "This order is already being processed. Please retry.",
      409,
      "ORDER_BUSY",
    );
  try {
    return await action();
  } finally {
    // Never release a replacement lease owned by another invocation.
    await redis([
      "EVAL",
      'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',
      1,
      lockKey,
      token,
    ]);
  }
}

export async function saveOrder(order) {
  await setValue("order:" + order.id, order);
  if (order.paypalOrderId)
    await setValue("paypal:" + order.paypalOrderId, order.id);
  if (order.refundId) await setValue("refund:" + order.refundId, order.id);
}

export async function addOrder(order) {
  await withLock("session:" + order.sessionId, async () => {
    const ids = (await getValue("session:" + order.sessionId)) || [];
    await saveOrder(order);
    await setValue(
      "session:" + order.sessionId,
      [order.id, ...ids].slice(0, 100),
    );
  });
}

export async function rateLimit(key, max = 60, windowSeconds = 60) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  key = `rate:${key}:${bucket}`;
  if (isDurable()) {
    const count = await redis([
      "EVAL",
      'local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("EXPIRE",KEYS[1],ARGV[1]) end; return n',
      1,
      prefix + key,
      Math.ceil(windowSeconds * 2),
    ]);
    if (count > max)
      throw new StudioError(
        "Too many requests. Try again in a minute.",
        429,
        "RATE_LIMITED",
      );
  } else {
    const count = (memory.limits.get(key) || 0) + 1;
    memory.limits.set(key, count);
    // Bound demo memory as traffic changes buckets.
    if (memory.limits.size > 2000)
      for (const old of memory.limits.keys())
        if (!old.endsWith(":" + bucket)) memory.limits.delete(old);
    if (count > max)
      throw new StudioError(
        "Too many requests. Try again in a minute.",
        429,
        "RATE_LIMITED",
      );
  }
}

export function resetMemoryForTests() {
  memory.values.clear();
  memory.queues.clear();
  memory.limits.clear();
}
