// Fictional no-key fixtures; never merged into receipts or sent to PayPal.
export const SAMPLE_LEDGER_ORDERS = [
  { id: "sample-delivered-0001", productName: "Forma everyday tote", packageId: "launch", amount: "39.00", capturedAmount: "39.00", status: "delivered", createdAt: "2026-11-09T04:00:00.000Z", qcAttempts: [{ passed: true }] },
  { id: "sample-refunded-0002", productName: "Canvas travel pouch", packageId: "starter", amount: "19.00", capturedAmount: "19.00", refundedAmount: "19.00", status: "refunded", createdAt: "2026-11-09T03:30:00.000Z", qcAttempts: [{ passed: false }, { passed: false }] },
  { id: "sample-paid-0003", productName: "Everyday desk tray", packageId: "growth", amount: "69.00", capturedAmount: "69.00", status: "paid", createdAt: "2026-11-09T03:00:00.000Z", qcAttempts: [] },
  { id: "sample-quoted-0004", productName: "Cotton storage bag", packageId: "starter", amount: "19.00", status: "quoted", createdAt: "2026-11-09T02:30:00.000Z", qcAttempts: [] },
];

export const LEDGER_STATUSES = {
  quoted: "Quote ready", awaiting_payment: "Awaiting payment", paid: "Payment confirmed",
  generating: "In the studio", delivered: "Delivered", refunded: "Refunded",
  refund_pending: "Refund pending", refund_failed: "Refund needs attention",
};

export function qualityResult(attempts = []) {
  if (!attempts.length) return "Not checked";
  const count = attempts.length;
  return `${attempts.at(-1).passed ? "Passed" : "Failed"}, ${count} ${count === 1 ? "check" : "checks"}`;
}

// Display columns exclude buyer details, full IDs, receipts and bundles.
// rowKey is the internal order ID and is never rendered or exported.
export function ledgerRows(orders) {
  return orders.map((order) => ({
    rowKey: String(order.id),
    orderNumber: String(order.id).slice(-8),
    product: order.productName,
    package: order.packageId,
    amount: Number(order.amount || 0),
    captured: Number(order.capturedAmount || 0),
    refunded: Number(order.refundedAmount || 0),
    status: LEDGER_STATUSES[order.status] || "Needs review",
    statusCode: Object.hasOwn(LEDGER_STATUSES, order.status) ? order.status : "unknown",
    timestamp: order.timeline?.at(-1)?.at || order.createdAt,
    quality: qualityResult(order.qcAttempts),
  }));
}
