import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/[...path]/route.js";

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
