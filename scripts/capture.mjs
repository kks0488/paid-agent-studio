import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(modulePath).href : "playwright"
);
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const output = process.env.CAPTURE_DIR || "media";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  slowMo: process.env.VIDEO_DIR ? 180 : 0,
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ...(process.env.VIDEO_DIR
    ? {
        recordVideo: {
          dir: process.env.VIDEO_DIR,
          size: { width: 1920, height: 1080 },
        },
      }
    : {}),
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(baseURL);
  await page.waitForLoadState("networkidle");
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/01-studio.png`, fullPage: true });
  const config = await (
    await context.request.get(`${baseURL}/api/config`)
  ).json();
  assert.equal(
    config.paymentMode,
    "simulated",
    "This capture script intentionally exercises simulated payments only.",
  );
  const post = async (path, data = {}) => {
    const response = await context.request.post(`${baseURL}/api/${path}`, {
      data,
    });
    const body = await response.json();
    assert.ok(response.ok(), `${path}: ${JSON.stringify(body)}`);
    return body;
  };
  const brief = {
    productName: "Forma everyday tote",
    facts:
      "100% cotton canvas; 12 L capacity; inner pocket; adjustable strap; sand color; hand wash only.",
    packageId: "launch",
    scenario: "standard",
  };
  await page.getByRole("button", { name: "Get my quote", exact: true }).click();
  await page.getByText("Quote ready", { exact: true }).waitFor();
  await page
    .getByRole("button", {
      name: "Continue to simulated checkout",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/02-quote.png` });
  const ordersResponse = await context.request.get(`${baseURL}/api/orders`);
  const quoted = (await ordersResponse.json()).orders[0];
  assert.equal(quoted.amount, "39.00");
  const early = await context.request.get(
    `${baseURL}/api/orders/${quoted.id}/download?format=json`,
  );
  assert.equal(early.status(), 409);
  await page
    .getByRole("button", {
      name: "Continue to simulated checkout",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Simulate $39.00 payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create my content bundle", exact: true })
    .click();
  await page
    .getByText("Quality checks passed. Your launch bundle is ready.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByText("Quality checks passed. Your launch bundle is ready.", {
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/03-delivery.png` });
  const { order: delivered } = await (
    await context.request.get(`${baseURL}/api/orders/${quoted.id}`)
  ).json();
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.capturedAmount, "39.00");
  await page.getByRole("tab", { name: "Ad copy", exact: true }).click();
  await page.getByRole("tab", { name: "Shorts script", exact: true }).click();
  await page.getByRole("tab", { name: "Product page", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Markdown", exact: true }).click();
  const browserDownload = await downloadEvent;
  assert.match(browserDownload.suggestedFilename(), /\.md$/);
  const download = await context.request.get(
    `${baseURL}/api/orders/${quoted.id}/download?format=markdown`,
  );
  assert.equal(download.status(), 200);
  assert.match(await download.text(), /Forma everyday tote/);
  assert.match(download.headers()["content-disposition"], /attachment/);
  const jsonFile = await context.request.get(
    `${baseURL}/api/orders/${quoted.id}/download?format=json`,
  );
  assert.ok((await jsonFile.json()).pdp.headline);
  // A separate API-only hostile amount test must never affect authoritative pricing.
  const { order: hostile } = await post("orders", { ...brief, amount: "0.01" });
  assert.equal(hostile.amount, "39.00");
  await page
    .getByRole("checkbox", { name: /Try the refund guarantee/ })
    .check();
  await page.getByRole("button", { name: "Get my quote", exact: true }).click();
  await page.getByText("Quote ready", { exact: true }).waitFor();
  await page
    .getByRole("button", {
      name: "Continue to simulated checkout",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Simulate $39.00 payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create my content bundle", exact: true })
    .click();
  await page
    .getByText("The work didn’t pass. Your payment came back.", { exact: true })
    .waitFor();
  await page
    .getByText("The work didn’t pass. Your payment came back.", { exact: true })
    .scrollIntoViewIfNeeded();
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/04-refund.png` });
  const { orders: completedOrders } = await (
    await context.request.get(`${baseURL}/api/orders`)
  ).json();
  const refunded = completedOrders.find(
    (order) => order.scenario === "guarantee",
  );
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.refundedAmount, "39.00");
  assert.equal(refunded.qcAttempts.length, 2);
  assert.ok(refunded.qcAttempts.every((attempt) => !attempt.passed));
  const { order: repeated } = await post(`orders/${refunded.id}/fulfill`);
  assert.equal(repeated.refundId, refunded.refundId);
  const foreign = await browser.newContext();
  assert.equal(
    (await foreign.request.get(`${baseURL}/api/orders/${quoted.id}`)).status(),
    404,
  );
  await foreign.close();
  const rejected = await context.request.post(`${baseURL}/api/orders`, {
    data: brief,
    headers: { Origin: "https://foreign.invalid" },
  });
  assert.equal(rejected.status(), 403);
  await page.getByRole("button", { name: /^Order ledger/ }).click();
  await page
    .getByRole("heading", { name: "Order ledger", exact: true })
    .waitFor();
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/05-ledger.png`, fullPage: true });
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/06-mobile.png`, fullPage: true });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflows, false, "Mobile must not overflow horizontally");
  assert.deepEqual(errors, [], "No uncaught browser errors");
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        paymentMode: config.paymentMode,
        aiMode: config.aiMode,
        passed: true,
        checks: [
          "visible quote/checkout/generate/download/refund UI flow",
          "server pricing ignores client amount",
          "capture to QC to delivery",
          "Markdown + JSON export",
          "two failed QC attempts trigger refund",
          "refund replay idempotency",
          "session isolation",
          "cross-origin rejection",
          "mobile overflow",
          "no page errors",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Browser/API checks passed; screenshots captured.");
} finally {
  await context.close();
  await browser.close();
}
