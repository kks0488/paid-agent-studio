import { StudioError } from "./store.js";

const base = "https://api-m.sandbox.paypal.com";
export const PAYPAL_TOOLS = Object.freeze({
  create_order: { method: "POST", path: "/v2/checkout/orders" },
  get_order: { method: "GET", path: "/v2/checkout/orders/{id}" },
  capture: { method: "POST", path: "/v2/checkout/orders/{id}/capture" },
  refund: { method: "POST", path: "/v2/payments/captures/{id}/refund" },
});

export function paymentMode() {
  if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox") {
    throw new StudioError(
      "Only PayPal Sandbox is enabled for this prototype.",
      503,
      "SANDBOX_ONLY",
    );
  }
  if (
    Boolean(process.env.PAYPAL_CLIENT_ID) !==
    Boolean(process.env.PAYPAL_CLIENT_SECRET)
  ) {
    throw new StudioError(
      "Configure both PayPal Sandbox credentials or clear both for simulated mode.",
      503,
      "PAYPAL_CONFIGURATION",
    );
  }
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
    ? "sandbox"
    : "simulated";
}

async function jsonFetch(url, options) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const result = await response.json();
    if (!response.ok) throw new Error();
    return result;
  } catch {
    throw new StudioError(
      "PayPal Sandbox request could not be confirmed. Retry safely with the same order.",
      502,
      "PAYPAL_UNAVAILABLE",
    );
  }
}

async function accessToken() {
  const result = await jsonFetch(base + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!result.access_token)
    throw new StudioError(
      "PayPal Sandbox authentication failed.",
      502,
      "PAYPAL_UNAVAILABLE",
    );
  return result.access_token;
}

export async function paypalRequest(method, path, body, requestId) {
  if (paymentMode() !== "sandbox")
    throw new StudioError(
      "Sandbox credentials are not configured.",
      503,
      "PAYPAL_CONFIGURATION",
    );
  const token = await accessToken();
  return jsonFetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      Prefer: "return=representation",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const amount = (order) => ({ currency_code: "USD", value: order.amount });
const simulatedId = (prefix, order) =>
  prefix + order.id.replaceAll("-", "").slice(0, 14);
export function createOrderBody(order) {
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: order.id,
        custom_id: order.id,
        description: `Paid Agent Studio · ${order.packageId}`,
        amount: amount(order),
      },
    ],
  };
}

export function simulatedOrder(order, captured = false) {
  return {
    id: order.paypalOrderId || simulatedId("SIM", order),
    intent: "CAPTURE",
    status: captured ? "COMPLETED" : "CREATED",
    purchase_units: [
      {
        reference_id: order.id,
        custom_id: order.id,
        amount: amount(order),
        ...(captured
          ? {
              payments: {
                captures: [
                  {
                    id: simulatedId("CAP", order),
                    status: "COMPLETED",
                    amount: amount(order),
                    final_capture: true,
                  },
                ],
              },
            }
          : {}),
      },
    ],
    links: [],
  };
}

export async function executeTool(tool, order) {
  if (!PAYPAL_TOOLS[tool]) throw new StudioError("Unknown payment tool.", 400);
  const spec = PAYPAL_TOOLS[tool];
  const resourceId = tool === "refund" ? order.captureId : order.paypalOrderId;
  const path = spec.path.replace("{id}", encodeURIComponent(resourceId || ""));
  if (order.paymentMode === "simulated") {
    if (tool === "refund")
      return {
        id: simulatedId("REF", order),
        status: "COMPLETED",
        amount: amount(order),
        links: [
          {
            rel: "up",
            href: base + `/v2/payments/captures/${order.captureId}`,
            method: "GET",
          },
        ],
      };
    return simulatedOrder(
      order,
      tool === "capture" || Boolean(order.captureId),
    );
  }
  const body =
    tool === "create_order"
      ? createOrderBody(order)
      : tool === "refund"
        ? {
            amount: amount(order),
            note_to_payer:
              "The Studio quality guarantee: two content checks failed. Full refund.",
          }
        : tool === "capture"
          ? {}
          : undefined;
  // Stable per-order IDs make retries safe even after a timeout or process restart.
  return paypalRequest(
    spec.method,
    path,
    body,
    spec.method === "POST" ? `pas-${tool}-${order.id}` : undefined,
  );
}

export function validateCapturedOrder(result, order) {
  const units = result?.purchase_units;
  if (
    result?.id !== order.paypalOrderId ||
    result?.status !== "COMPLETED" ||
    !Array.isArray(units) ||
    units.length !== 1
  ) {
    throw new StudioError(
      "Payment could not be matched to this order.",
      409,
      "PAYMENT_MISMATCH",
    );
  }
  const unit = units[0],
    captures = unit.payments?.captures;
  const valueMatches = (value) =>
    value?.currency_code === order.currency &&
    /^\d+\.\d{2}$/.test(value.value || "") &&
    Number(value.value) === Number(order.amount);
  if (
    unit.custom_id !== order.id ||
    !valueMatches(unit.amount) ||
    captures?.length !== 1 ||
    captures[0].status !== "COMPLETED" ||
    !captures[0].id ||
    !valueMatches(captures[0].amount)
  ) {
    throw new StudioError(
      "Captured amount, currency or order identity did not match.",
      409,
      "PAYMENT_MISMATCH",
    );
  }
  return captures[0];
}

export function validateRefund(result, order) {
  if (
    !result?.id ||
    !["COMPLETED", "PENDING"].includes(result.status) ||
    result.amount?.currency_code !== order.currency ||
    Number(result.amount?.value) !== Number(order.capturedAmount)
  ) {
    throw new StudioError(
      "Refund confirmation did not match the captured payment.",
      502,
      "REFUND_MISMATCH",
    );
  }
  return result;
}

export async function verifyWebhook(headers, event) {
  if (paymentMode() !== "sandbox" || !process.env.PAYPAL_WEBHOOK_ID)
    throw new StudioError(
      "A configured Sandbox webhook is required.",
      503,
      "WEBHOOK_CONFIGURATION",
    );
  const read = (name) =>
    typeof headers.get === "function"
      ? headers.get(name)
      : headers[name] ||
        headers[name.toLowerCase()] ||
        Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name,
        )?.[1];
  const payload = {
    auth_algo: read("paypal-auth-algo"),
    cert_url: read("paypal-cert-url"),
    transmission_id: read("paypal-transmission-id"),
    transmission_sig: read("paypal-transmission-sig"),
    transmission_time: read("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  };
  if (
    typeof event?.id !== "string" ||
    !event.id ||
    event.id.length > 200 ||
    !event.event_type ||
    !payload.auth_algo ||
    !payload.cert_url ||
    !payload.transmission_id ||
    !payload.transmission_sig ||
    !payload.transmission_time
  )
    throw new StudioError(
      "Webhook signature headers are incomplete.",
      400,
      "INVALID_WEBHOOK",
    );
  // PayPal validates the certificate and signature remotely; this server never fetches cert_url.
  const result = await paypalRequest(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    payload,
  );
  if (result.verification_status !== "SUCCESS")
    throw new StudioError(
      "Webhook signature verification failed.",
      401,
      "INVALID_WEBHOOK",
    );
  return true;
}
