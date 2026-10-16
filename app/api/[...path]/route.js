import {
  getConfig,
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

async function handle(request, context) {
  const { path } = await context.params;
  const auth = session(request);
  try {
    const webhook = path.join("/") === "webhooks/paypal";
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
export const GET = handle;
export const POST = handle;
