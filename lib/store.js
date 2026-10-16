import { AsyncLocalStorage } from "node:async_hooks";
const requests = new AsyncLocalStorage();

// Sandbox state exists only for this request; the browser carries signed receipts.
export function withRequestOrders(orders, action) {
  return requests.run(new Map(orders.flatMap(order => [["order:" + order.id, structuredClone(order)]])), action);
}
export const isStatelessRequest = () => Boolean(requests.getStore());

const memory = (globalThis.__paidAgentStore ||= {
  values: new Map(),
  queues: new Map(),
  limits: new Map(),
});
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
  return Boolean(process.env.APP_SIGNING_SECRET);
}
export async function getValue(key) {
  return clone((requests.getStore() || memory.values).get(key) ?? null);
}
export async function setValue(key, value) {
  (requests.getStore() || memory.values).set(key, clone(value));
}
// Best-effort in-process serialization. Financial idempotency is enforced by PayPal.
export async function withLock(key, action) {
  const previous = memory.queues.get(key) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  memory.queues.set(key, next);
  await previous;
  try { return await action(); }
  finally {
    release();
    if (memory.queues.get(key) === next) memory.queues.delete(key);
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
  const count = (memory.limits.get(key) || 0) + 1;
  memory.limits.set(key, count);
  if (memory.limits.size > 2000)
    for (const old of memory.limits.keys())
      if (!old.endsWith(":" + bucket)) memory.limits.delete(old);
  if (count > max)
    throw new StudioError("Too many requests. Try again in a minute.", 429, "RATE_LIMITED");
}

export function resetMemoryForTests() {
  memory.values.clear();
  memory.queues.clear();
  memory.limits.clear();
}

export function requestOrders() {
 return [...(requests.getStore() || memory.values).entries()].filter(([key]) => key.startsWith("order:")).map(([,value]) => clone(value));
}
