import { createHmac } from "node:crypto";
import { StudioError } from "./store.js";
import { jobDigest } from "./tokens.js";

export const stateReady = () => Boolean(process.env.STATE_URL && process.env.STATE_SECRET);
export async function stateRequest(action, key, extra = {}) {
  if (!stateReady()) throw new StudioError("Durable fulfillment is unavailable. No generation or refund was started.", 503, "STATE_UNAVAILABLE");
  const body = JSON.stringify({ action, key, ...extra });
  const stamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", process.env.STATE_SECRET).update(stamp + "\n" + body).digest("hex");
  try {
    const response = await fetch(process.env.STATE_URL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "x-state-app": "paypal", "x-state-time": stamp, "x-state-signature": signature }, body });
    if (!response.ok) throw new StudioError("Fulfillment state changed or is unavailable. Retry this job safely.", response.status === 409 ? 409 : 503, "STATE_UNAVAILABLE");
    return await response.json();
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError("Fulfillment storage could not be confirmed. No new work was authorized.", 503, "STATE_UNAVAILABLE");
  }
}
const keyOf = order => "job:" + order.id;
const bindingOf = order => [order.id, order.jobNonce, order.paypalOrderId, order.captureId, jobDigest(order)].join(":");
const checkoutBinding = order => [order.id, order.jobNonce, order.paypalOrderId, jobDigest(order)].join(":");
export async function storedCheckout(id) {
  return stateRequest("get", "checkout:" + id);
}
export async function rememberCheckout(order) {
  if (order.paymentMode !== "sandbox") return;
  if (!order.jobNonce || !order.paypalOrderId) throw new StudioError("A bound checkout is required.", 409, "PAYMENT_MISMATCH");
  const binding = checkoutBinding(order);
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await storedCheckout(order.id);
    if (record.value) {
      if (record.value.binding !== binding) throw new StudioError("Checkout belongs to another job.", 409, "NONCE_MISMATCH");
      return;
    }
    try {
      await stateRequest("cas", "checkout:" + order.id, { version: 0, value: { binding, order: structuredClone(order), events: [] } });
      return;
    } catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
  }
}
export async function recordVerifiedWebhook(order, event) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const record = await storedCheckout(order.id);
    if (!record.value || record.value.binding !== checkoutBinding(order)) throw new StudioError("Webhook checkout binding changed.", 409, "NONCE_MISMATCH");
    if (record.value.events.some(item => item.eventId === event.eventId)) return;
    try {
      await stateRequest("cas", "checkout:" + order.id, { version: record.version,
        value: { ...record.value, events: [...record.value.events, event].slice(-100) } });
      return;
    } catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
  }
}
export async function attachVerifiedWebhooks(order) {
  const record = await storedCheckout(order.id);
  if (!record.value) return; // Receipts issued before durable checkout handoff remain usable.
  if (record.value.binding !== checkoutBinding(order)) throw new StudioError("Checkout binding changed.", 409, "NONCE_MISMATCH");
  for (const event of record.value.events) {
    if (!order.timeline.some(item => item.eventId === event.eventId)) order.timeline.push(event);
  }
}
export async function fulfillmentRecord(order) {
  const record = await stateRequest("get", keyOf(order));
  if (record.value && record.value.binding !== bindingOf(order))
    throw new StudioError("This capture belongs to another job nonce.", 409, "NONCE_MISMATCH");
  return record;
}
export async function claimFulfillment(order) {
  if (order.paymentMode !== "sandbox") return {};
  if (!order.jobNonce) throw new StudioError("This legacy receipt cannot start generation or refunds. Start a new quote.", 409, "LEGACY_RECEIPT");
  if (!order.captureId || !["paid", "generating", "delivered", "refund_failed", "refund_pending", "refunded"].includes(order.status))
    throw new StudioError("A confirmed capture is required.", 409, "PAYMENT_REQUIRED");
  const record = await fulfillmentRecord(order);
  if (record.value) {
    if (["delivered", "refunded"].includes(record.value.order.status)) return { recovered: record.value.order };
    if (["refund_failed", "refund_pending"].includes(record.value.order.status)) {
      Object.assign(order, record.value.order);
      return { version: record.version, binding: record.value.binding };
    }
    throw new StudioError("This job nonce was already used. Work may still be running; refresh the ledger. Interrupted work needs seller review.", 409, "NONCE_USED");
  }
  // Fail closed for old delivered/refunded receipts without a durable record too.
  if (order.status !== "paid") throw new StudioError("A fresh paid job is required.", 409, "NONCE_USED");
  const binding = bindingOf(order);
  const claimed = await stateRequest("cas", keyOf(order), { version: 0, value: { binding, order: { ...order, status: "generating" } } });
  return { version: claimed.version, binding };
}
export async function finishFulfillment(order, claim) {
  if (order.paymentMode !== "sandbox") return;
  const result = await stateRequest("cas", keyOf(order), { version: claim.version, value: { binding: claim.binding, order } });
  claim.version = result.version;
}
export async function acceptDelivery(order) {
  if (order.paymentMode !== "sandbox" || !order.jobNonce) return;
  const record = await fulfillmentRecord(order);
  if (record.value?.order.status !== "delivered") throw new StudioError("Delivery could not be confirmed.", 409, "NOT_DELIVERED");
  if (!record.value.order.acceptedAt) {
    const accepted = { ...record.value.order, acceptedAt: new Date().toISOString() };
    await stateRequest("cas", keyOf(order), { version: record.version, value: { ...record.value, order: accepted } });
  }
}
