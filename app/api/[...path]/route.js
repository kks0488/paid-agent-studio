import { verifyJob } from "../../../lib/tokens.js";
import { withRequestOrders } from "../../../lib/store.js";
import {
  getConfig,
  refreshPaymentEvents,
  createQuote,
  listOrders,
  getOrder,
  createCheckout,
  captureOrder,
  fulfillOrder,
  downloadOrder,
  handleWebhook,
  fulfillVerifiedWebhook,
} from "../../../lib/studio.js";
import {
  session,
  response,
  guard,
  readBody,
  HttpError,
} from "../../../lib/http.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function handleInner(request, context, auth) {
  const { path } = await context.params;
  try {
    const webhook = ["webhooks/paypal", "paypal/webhook"].includes(path.join("/"));
    await guard(request, webhook ? null : auth, webhook);
    if (webhook && request.method === "POST") {
      const result = await handleWebhook(
        request.headers,
        await readBody(request),
      );
      if (result.orderId && ["paid", "generating"].includes(result.status)) {
        const { after } = await import("next/server");
        after(() => fulfillVerifiedWebhook(result.orderId));
      }
      return response(request, null, result);
    }
    if (path.join("/") === "config" && request.method === "GET")
      return response(request, auth, getConfig());
    if (path.join("/") === "ledger" && request.method === "POST") {
      const body = await readBody(request, 1800000);
      if (!Array.isArray(body.tokens) || body.tokens.length > 20) throw new HttpError(400, "Use at most 20 signed jobs.");
      const jobs = [];
      for (const token of body.tokens) {
        try { jobs.push(verifyJob(token, auth.id)); }
        catch (error) { if (error.code !== "INVALID_JOB_TOKEN") throw error; }
      }
      return withRequestOrders(jobs, async () => response(request, auth, { orders: await listOrders(auth.id) }));
    }
    if (path[0] !== "orders") throw new HttpError(404, "Page not found.");
    if (path.length === 1) {
      if (request.method === "GET")
        return response(request, auth, { orders: await listOrders(auth.id) });
      if (request.method === "POST")
        return response(
          request,
          auth,
          { order: await createQuote(await readBody(request), auth.id) },
          201,
        );
    }
    const id = path[1];
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id || ""))
      throw new HttpError(404, "Order not found.");
    if (path.length === 2 && request.method === "GET")
      return response(request, auth, { order: await getOrder(id, auth.id) });
    if (path.length === 3 && request.method === "POST") {
      const body = await readBody(request);
      if (path[2] === "checkout")
        return response(request, auth, await createCheckout(id, auth.id));
      if (path[2] === "capture")
        return response(request, auth, {
          order: await captureOrder(id, auth.id, body),
        });
      if (path[2] === "events")
        return response(request, auth, { order: await refreshPaymentEvents(id, auth.id) });
      if (path[2] === "fulfill")
        return response(request, auth, {
          order: await fulfillOrder(id, auth.id),
        });
    }
    if (
      path.length === 3 &&
      path[2] === "download" &&
      request.method === "GET"
    ) {
      const format =
        new URL(request.url).searchParams.get("format") || "markdown";
      if (!["markdown", "json"].includes(format))
        throw new HttpError(400, "Choose Markdown or JSON.");
      const file = await downloadOrder(id, auth.id, format);
      return new Response(file.body, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw new HttpError(404, "Page not found.");
  } catch (error) {
    const code = error.status || error.statusCode;
    const status =
      Number.isInteger(code) && code >= 400 && code < 600 ? code : 500;
    return response(
      request,
      auth,
      {
        error:
          status >= 500 && error.name !== "StudioError"
            ? "The service could not finish this step. Please retry."
            : error.message || "Request could not be completed.",
      },
      status,
    );
  }
}
async function handle(request, context) {
  const auth = session(request);
  const token = request.headers.get("x-job-token");
  try {
    const jobs = token ? [verifyJob(token, auth.id)] : [];
    // Demo mode retains optional process-memory convenience. Sandbox never relies on it.
    if (process.env.PAYPAL_CLIENT_ID || token) return await withRequestOrders(jobs, () => handleInner(request, context, auth));
    return await handleInner(request, context, auth);
  } catch (error) {
    return response(request, auth, { error: error.message || "Invalid signed job." }, error.status || 400);
  }
}
export const GET = handle;
export const POST = handle;
