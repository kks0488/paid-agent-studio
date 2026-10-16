import test from "node:test";
import assert from "node:assert/strict";
import { session, guard, readBody, response } from "../lib/http.js";

test("random HttpOnly session persists only when valid", () => {
  const req = new Request("https://studio.example/api/config");
  const auth = session(req);
  assert.match(auth.id, /^[a-f0-9]{64}$/);
  assert.equal(auth.fresh, true);
  assert.equal(
    session(
      new Request(req, { headers: { cookie: `studio_session=${auth.id}` } }),
    ).id,
    auth.id,
  );
  assert.notEqual(
    session(new Request(req, { headers: { cookie: "studio_session=guess" } }))
      .id,
    "guess",
  );
  const result = response(req, auth, {});
  assert.match(result.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.match(result.headers.get("set-cookie"), /Secure/);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("mutations reject foreign origins and non-JSON bodies", async () => {
  await assert.rejects(
    guard(
      new Request("https://studio.example/api/orders", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
      }),
      null,
    ),
    (error) => error.status === 403,
  );
  await assert.rejects(
    guard(
      new Request("https://studio.example/api/orders", { method: "POST" }),
      null,
    ),
    (error) => error.status === 415,
  );
});

test("stream body limits apply even without Content-Length", async () => {
  await assert.rejects(
    readBody(
      new Request("https://studio.example/api/orders", {
        method: "POST",
        body: "a".repeat(16385),
      }),
    ),
    (error) => error.status === 413,
  );
  await assert.rejects(
    readBody(
      new Request("https://studio.example/api/orders", {
        method: "POST",
        body: "{",
      }),
    ),
    (error) => error.status === 400,
  );
  assert.deepEqual(
    await readBody(
      new Request("https://studio.example/api/orders", {
        method: "POST",
        body: '{"facts":"canvas"}',
      }),
    ),
    { facts: "canvas" },
  );
});

test("same-origin proxy requests compare the browser Host rather than the internal Next hostname", async () => {
  await guard(
    new Request("http://0.0.0.0:3187/api/orders", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3187",
        origin: "http://127.0.0.1:3187",
        "content-type": "application/json",
      },
    }),
    { id: "proxy-http-test" },
  );
  await assert.rejects(
    guard(
      new Request("http://0.0.0.0:3187/api/orders", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3187",
          origin: "http://foreign.invalid",
          "content-type": "application/json",
        },
      }),
      null,
    ),
    (error) => error.status === 403,
  );
});
