import test from "node:test";
import assert from "node:assert/strict";
import { ledgerRows, qualityResult, SAMPLE_LEDGER_ORDERS } from "../lib/ledger.js";

test("ledger display projects stored order state without private data or full IDs", () => {
  const order = { ...SAMPLE_LEDGER_ORDERS[0], id: "private-prefix-12345678", jobToken: "private-receipt",
    buyer: { email: "buyer@example.test", name: "Private Buyer" }, email: "buyer@example.test",
    timeline: [{ at: "2026-11-09T05:00:00.000Z" }], qcAttempts: [{ passed: false }, { passed: true }] };
  const [row] = ledgerRows([order]);
  assert.equal(row.orderNumber, "12345678");
  assert.equal(row.amount, 39);
  assert.equal(row.captured, 39);
  assert.equal(row.timestamp, order.timeline[0].at);
  assert.equal(row.status, "Delivered");
  assert.equal(row.quality, "Passed · 2 checks");
  for (const secret of [order.id, order.jobToken, order.email, order.buyer.name]) assert.ok(!JSON.stringify(row).includes(secret));
  assert.equal(order.jobToken, "private-receipt", "projection must not mutate receipts");
});

test("pending or failed refunds and failed checks remain distinct from completed refunds", () => {
  const base = SAMPLE_LEDGER_ORDERS[1];
  const rows = ledgerRows([base, { ...base, status: "refund_pending", refundedAmount: "0.00" }, { ...base, status: "refund_failed", refundedAmount: "0.00" }]);
  assert.deepEqual(rows.map(row => row.status), ["Refunded", "Refund pending", "Refund needs attention"]);
  assert.deepEqual(rows.map(row => row.refunded), [19, 0, 0]);
  assert.equal(rows[0].quality, "Failed · 2 checks");
  assert.equal(qualityResult(), "Not checked");
});

test("no-key samples cover quote, payment, delivery and refund without receipts", () => {
  assert.deepEqual(new Set(SAMPLE_LEDGER_ORDERS.map(order => order.status)), new Set(["quoted", "paid", "delivered", "refunded"]));
  assert.ok(SAMPLE_LEDGER_ORDERS.every(order => !order.jobToken && !order.paypalOrderId && !order.sessionId));
  const rows = ledgerRows(SAMPLE_LEDGER_ORDERS);
  assert.equal(rows.reduce((total, row) => total + row.captured, 0), 127);
  assert.equal(rows.reduce((total, row) => total + row.refunded, 0), 19);
});
