import { randomBytes } from "node:crypto";
import { rateLimit } from "./store.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function session(request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("studio_session="))
    ?.slice(15);
  const id = /^[a-f0-9]{64}$/.test(raw || "")
    ? raw
    : randomBytes(32).toString("hex");
  return { id, fresh: id !== raw };
}
export function response(request, auth, data, status = 200, extraHeaders = {}) {
  const headers = { "Cache-Control": "no-store", ...extraHeaders };
  if (auth?.fresh)
    headers["Set-Cookie"] =
      `studio_session=${auth.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  return Response.json(data, { status, headers });
}
export async function guard(request, auth, webhook = false) {
  if (!webhook && request.method === "POST") {
    const origin = request.headers.get("origin");
    const requestUrl = new URL(request.url);
    const expectedHost = request.headers.get("host") || requestUrl.host;
    let sameOrigin = !origin;
    try {
      const source = new URL(origin);
      sameOrigin =
        source.host === expectedHost && source.protocol === requestUrl.protocol;
    } catch {
      /* Missing Origin is allowed for non-browser API clients. */
    }
    if (!sameOrigin)
      throw new HttpError(403, "This request must come from the Studio.");
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(415, "Send application/json.");
  }
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for") || "unknown")
        .split(",")[0]
        .trim()
    : "local";
  await rateLimit(
    `ip:${ip}:${webhook ? "webhook" : "studio"}`,
    webhook ? 180 : 120,
    60,
  );
  if (auth) await rateLimit(`session:${auth.id}`, 90, 60);
}
export async function readBody(request) {
  if (Number(request.headers.get("content-length")) > 16384)
    throw new HttpError(413, "The brief is too long.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new HttpError(413, "The brief is too long.");
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Send a valid JSON object.");
  }
}
