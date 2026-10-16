import assert from "node:assert/strict";
import { mkdir, writeFile, chmod } from "node:fs/promises";
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
  locale: "en-US",
  ...(process.env.RESUME_CHECKOUT === "1" ? {storageState:"/tmp/paypal-live-state.json"} : {}),
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
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
async function receiptHeaders(path) {
  const id = path.match(/orders\/([^/?]+)/)?.[1];
  if (!id || new URL(page.url()).origin !== new URL(baseURL).origin) return {};
  const job = await page.evaluate(id => JSON.parse(localStorage.getItem("paid-agent-studio-receipts-v2") || "[]").find(job => job.id === id), id);
  return job?.jobToken ? {"x-job-token":job.jobToken} : {};
}
async function studioGet(path) {
  if (path === "orders" && new URL(page.url()).origin === new URL(baseURL).origin) {
    const tokens=await page.evaluate(()=>JSON.parse(localStorage.getItem("paid-agent-studio-receipts-v2") || "[]").map(job=>job.jobToken));
    return context.request.post(`${baseURL}/api/ledger`,{data:{tokens}});
  }
  return context.request.get(`${baseURL}/api/${path}`,{headers:await receiptHeaders(path)});
}
try {
  await page.goto(baseURL);
  await page.waitForLoadState("networkidle");
  if (process.env.VIDEO_DIR) await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: `${output}/01-studio.png`, fullPage: false });
  const config = await (
    await context.request.get(`${baseURL}/api/config`)
  ).json();
  if (config.paymentMode === "sandbox") {
    await captureSandbox(page, context, config);
    await context.close();
    await browser.close();
    process.exit(0);
  }
  assert.equal(
    config.paymentMode,
    "simulated",
    "This capture script intentionally exercises simulated payments only.",
  );
  const post = async (path, data = {}) => {
    const response = await context.request.post(`${baseURL}/api/${path}`, {
      data,
      headers: await receiptHeaders(path),
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
  const ordersResponse = await studioGet("orders");
  const quoted = (await ordersResponse.json()).orders[0];
  assert.equal(quoted.amount, "39.00");
  if (process.env.EXPECT_LIVE === "1") assert.equal(quoted.quoteMode, "live", "Quote must use a live final answer");
  const early = await studioGet(
    `orders/${quoted.id}/download?format=json`,
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
  const fulfillment = page.waitForResponse(response => response.url().endsWith(`/orders/${quoted.id}/fulfill`) && response.request().method() === "POST");
  await page
    .getByRole("button", { name: "Create my content bundle", exact: true })
    .click();
  const fulfillmentBody = await (await fulfillment).json();
  console.log(JSON.stringify({ fulfillment: fulfillmentBody.order?.status, qcAttempts: fulfillmentBody.order?.qcAttempts, llmUsage: fulfillmentBody.order?.llmUsage, error: fulfillmentBody.error }));
  if (fulfillmentBody.order && fulfillmentBody.order.status !== "delivered") throw new Error(`Content order ended as ${fulfillmentBody.order.status}`);
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
  await page.screenshot({ path: `${output}/error.png` });
  const { order: delivered } = await (
    await studioGet(`orders/${quoted.id}`)
  ).json();
  assert.equal(delivered.status, "delivered");
  if (process.env.EXPECT_LIVE === "1") assert.equal(delivered.aiMode, "live", "Delivered content must be live, not fallback");
  assert.equal(delivered.capturedAmount, "39.00");
  await page.getByRole("tab", { name: "Ad copy", exact: true }).click();
  await page.getByRole("tab", { name: "Shorts script", exact: true }).click();
  await page.getByRole("tab", { name: "Product page", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Markdown", exact: true }).click();
  const browserDownload = await downloadEvent;
  assert.match(browserDownload.suggestedFilename(), /\.md$/);
  const download = await studioGet(
    `orders/${quoted.id}/download?format=markdown`,
  );
  assert.equal(download.status(), 200);
  assert.match(await download.text(), /Forma everyday tote/);
  assert.match(download.headers()["content-disposition"], /attachment/);
  const jsonFile = await studioGet(
    `orders/${quoted.id}/download?format=json`,
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
    await studioGet("orders")
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
  await page.screenshot({ path: `${output}/05-ledger.png`, fullPage: false });
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
        aiMode: delivered.aiMode,
        quoteMode: quoted.quoteMode,
        liveUsage: [...(delivered.llmUsage || []), ...(hostile.llmUsage || [])],
        productionUrl: baseURL,
        desktopViewport: { width: 1920, height: 1080 },
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
} catch (error) {
  await context.storageState({path:"/tmp/paypal-live-state.json"});
  await chmod("/tmp/paypal-live-state.json",0o600);
  const ordersResponse = await studioGet("orders");
  const orders = ordersResponse.ok() ? (await ordersResponse.json()).orders : [];
  await page.screenshot({ path: `${output}/03-delivery.png` });
  await writeFile(`${output}/verification.json`, JSON.stringify({ testedAt: new Date().toISOString(), productionUrl: baseURL, passed: false, error: error.message, orders: orders.map(order => ({ status: order.status, quoteMode: order.quoteMode, aiMode: order.aiMode, aiNotice: order.aiNotice, qcAttempts: order.qcAttempts, llmUsage: order.llmUsage })) }, null, 2) + "\n");
  console.log(JSON.stringify({ failed: true, orders: orders.map(order => ({ status: order.status, aiMode: order.aiMode, quoteMode: order.quoteMode, qcAttempts: order.qcAttempts, llmUsage: order.llmUsage })) }));
  throw error;
} finally {
  await context.close();
  await browser.close();
}


async function captureSandbox(page, context, config) {
  assert.equal(config.liveReady, true);
  assert.equal(config.aiMode, "live");
  const results = [];
  const receipts = () => page.evaluate(() => JSON.parse(localStorage.getItem("paid-agent-studio-receipts-v2") || "[]"));
  const screenshot = async name => {
    await page.waitForTimeout(1200);
    await page.screenshot({path: `${output}/${name}.png`});
  };
  async function guestPay(index) {
    const generator = await browser.newPage();
    let fixture;
    try {
      await generator.goto("https://developer.paypal.com/sandbox-testing/card-testing#credit-card-generator",{waitUntil:"domcontentloaded"});
      await generator.getByLabel("Card type",{exact:true}).selectOption("Visa");
      await generator.getByLabel("Country",{exact:true}).selectOption("US");
      await generator.getByRole("button",{name:"Generate Credit Card",exact:true}).click();
      await generator.waitForFunction(() => {
        const text=document.querySelector('[class*="creditcardgenerator_details"]')?.innerText || "";
        return /Card number\s+\d{16}/.test(text) && /Expiry date\s+\d{2}\/\d{4}/.test(text) && /CVC code\s+\d{3}/.test(text);
      },null,{timeout:30000});
      const details=await generator.locator('[class*="creditcardgenerator_details"]').innerText();
      fixture={number:details.match(/Card number\s+(\d{16})/)[1],expiry:details.match(/Expiry date\s+(\d{2})\/(\d{4})/),cvv:details.match(/CVC code\s+(\d{3})/)[1]};
    } finally { await generator.close(); }
    await page.getByRole("button", {name: "Continue to PayPal Sandbox", exact: true}).click();
    await page.getByRole("button", {name: "Sandbox guest card checkout", exact: true}).click();
    await page.waitForURL(url => url.hostname === "www.sandbox.paypal.com", {timeout:60000});
    await page.waitForTimeout(2500);
    // Standard guest checkout is available even when Expanded card processing is disabled.
    const guest = page.getByRole("button", {name: /Pay with Debit|Debit or Credit|직불카드|credit or debit/i});
    if (await guest.count()) await guest.first().click();
    await page.locator("#cardNumber").waitFor({timeout:60000});
    await page.locator("#country").selectOption("US");
    await page.locator("#cardNumber").fill(process.env.SANDBOX_TEST_CARD || fixture.number);
    await page.locator("#cardExpiry").fill(process.env.SANDBOX_TEST_EXPIRY || fixture.expiry[1] + fixture.expiry[2].slice(-2));
    await page.locator("#cardCvv").fill(process.env.SANDBOX_TEST_CVV || fixture.cvv);
    await page.locator("#firstName").fill("Sandbox");
    await page.locator("#lastName").fill("Buyer");
    await page.locator("#billingLine1").fill("123 Test Street");
    await page.locator("#billingCity").fill("San Jose");
    await page.locator("#billingState").selectOption("CA");
    await page.locator("#billingPostalCode").fill("95131");
    await page.locator("#phone").fill("2025550123");
    await page.locator("#email").fill(`sandbox-guest-${Date.now()}@example.com`);
    const accountSwitch=page.locator('input[data-testid="onboard-options-switch"]');
    if (await accountSwitch.count() && await accountSwitch.isChecked()) {
      // The native checkbox is visually hidden. Keyboard activation avoids the
      // off-screen pointer target and still uses PayPal's actual change handler.
      await accountSwitch.press("Space");
      await page.waitForFunction(()=>!document.querySelector('input[data-testid="onboard-options-switch"]')?.checked,null,{timeout:5000});
    }
    const guestChoice=page.locator('label[for="onboardOptionGuest"]');
    if (await guestChoice.count()) await guestChoice.click();
    await screenshot(`0${index}-sandbox-checkout`);
    const closeCookies=page.getByRole("button",{name:/^Close$/});
    if (await closeCookies.isVisible().catch(()=>false)) await closeCookies.click();
    console.log("Sandbox payment buttons:",await page.getByRole("button").allTextContents());
    const guestButton=page.getByRole("button",{name:"Pay now as guest",exact:true});
    if (await guestButton.isVisible().catch(()=>false)) await guestButton.click({timeout:15000});
    else {
      const createAccount=page.getByRole("checkbox",{name:/create|save/i});
      if (await createAccount.count()) await createAccount.uncheck();
      const submit=page.getByRole("button",{name:/^(Pay Now|Pay now|Agree and Pay|Continue|Agree & Pay|바로 결제)$/i});
      if (!await submit.count()) throw new Error("PayPal changed the guest checkout submit control.");
      await submit.first().click({timeout:15000});
    }
    try {
      await Promise.race([
        page.waitForURL(url => url.hostname === new URL(baseURL).hostname, {timeout:60000}),
        page.getByText(/weren.t able to add this card|can.t process|unable to process/i).waitFor({timeout:60000}).then(()=>{throw new Error("PayPal Sandbox rejected this test card; use a fresh card from the official generator.");})
      ]);
    } catch (error) {
      console.log("Sandbox guest result:", (await page.locator("body").innerText()).slice(-5000));
      await page.screenshot({path:`${output}/sandbox-checkout-error.png`});
      throw error;
    }
    await page.getByRole("button", {name:"Create my content bundle",exact:true}).waitFor({timeout:120000});
    const jobs = await receipts();
    const paid = jobs.find(job=>job.status === "paid");
    assert.ok(paid?.captureId, "Real PayPal Sandbox capture required");
    assert.equal(paid.paymentMode, "sandbox");
    console.log(JSON.stringify({stage:"captured",jobId:paid.id,paypalOrderId:paid.paypalOrderId,captureId:paid.captureId}));
    await context.storageState({path:"/tmp/paypal-live-state.json"});
    await chmod("/tmp/paypal-live-state.json",0o600);
    return paid;
  }
  const record = safe => ({jobId:safe.id,paypalOrderId:safe.paypalOrderId,captureId:safe.captureId,refundId:safe.refundId,status:safe.status,quoteMode:safe.quoteMode,aiMode:safe.aiMode,llmUsage:safe.llmUsage,qcAttempts:safe.qcAttempts,timeline:safe.timeline});
  if (process.env.RESUME_CHECKOUT === "1") {
    for (const prior of (await receipts()).filter(job=>["delivered","refunded"].includes(job.status))) results.push(record(prior));
  }
  for (const scenario of (process.env.SCENARIOS || "standard,guarantee").split(",")) {
    if (scenario === "guarantee") await page.getByRole("checkbox",{name:/Try the refund guarantee/}).check();
    const existing = process.env.RESUME_CHECKOUT === "1" ? (await receipts()).find(job=>job.status === "awaiting_payment" && job.scenario === scenario) : null;
    if (existing) {
      await page.getByRole("button",{name:/^Order ledger/}).click();
      await page.getByRole("row").filter({hasText:existing.id}).getByRole("button",{name:/^Open /}).click();
    } else {
      await page.getByRole("button",{name:"Get my quote",exact:true}).click();
      await page.getByText("Quote ready",{exact:true}).waitFor();
    }
    const quote=existing || (await receipts())[0];
    assert.equal(quote.quoteMode,"live");
    await screenshot(scenario === "standard" ? "02-quote" : "04-refund-quote");
    const paid = await guestPay(scenario === "standard" ? 3 : 5);
    // Give the real PayPal notification time to reach our verified listener.
    await page.waitForTimeout(8000);
    const fulfillment=page.waitForResponse(r=>r.url().endsWith(`/orders/${paid.id}/fulfill`) && r.request().method()==="POST");
    await page.getByRole("button",{name:"Create my content bundle",exact:true}).click();
    const response=await fulfillment;
    const result=await response.json();
    assert.ok(response.ok(),result.error);
    await context.storageState({path:"/tmp/paypal-live-state.json"});
    await chmod("/tmp/paypal-live-state.json",0o600);
    console.log(JSON.stringify({stage:"fulfillment",paypalOrderId:result.order?.paypalOrderId,captureId:result.order?.captureId,refundId:result.order?.refundId,status:result.order?.status,qcAttempts:result.order?.qcAttempts,llmUsage:result.order?.llmUsage,timeline:result.order?.timeline}));
    assert.equal(result.order.status,scenario === "standard" ? "delivered" : "refunded",JSON.stringify({status:result.order.status,qc:result.order.qcAttempts}));
    assert.equal(result.order.aiMode,"live");
    assert.ok(result.order.llmUsage.some(usage=>usage.step==="content"));
    const replayResponse = await context.request.post(`${baseURL}/api/orders/${paid.id}/fulfill`, {
      data: {}, headers: {"x-job-token": paid.jobToken}
    });
    const replayBody=await replayResponse.json();
    assert.ok(replayResponse.ok(), `Stale paid receipt must reconcile safely (${replayResponse.status()}): ${replayBody.error || "unknown response"}`);
    const replayed = replayBody.order;
    assert.equal(replayed.status, result.order.status);
    assert.deepEqual(replayed.bundle, result.order.bundle);
    assert.equal(replayed.llmUsage.length, result.order.llmUsage.length, "Replay must not invoke the model again");
    assert.equal(replayed.refundId, result.order.refundId);

    console.log(JSON.stringify({stage:result.order.status,paypalOrderId:result.order.paypalOrderId,captureId:result.order.captureId,refundId:result.order.refundId,qc:result.order.qcAttempts,llmUsage:result.order.llmUsage}));
    await screenshot(scenario === "standard" ? "03-delivery" : "04-refund");
    if (scenario === "standard") {
      const download=page.waitForEvent("download");
      await page.getByRole("link",{name:"Markdown",exact:true}).click();
      assert.match((await download).suggestedFilename(),/\.md$/);
    }
    const {jobToken, ...safe}=result.order;
    results.push(record(safe));
    await context.storageState({path:"/tmp/paypal-live-state.json"});
    await chmod("/tmp/paypal-live-state.json",0o600);
  }
  await page.getByRole("button",{name:/^Order ledger/}).click();
  await page.getByRole("heading",{name:"Order ledger",exact:true}).waitFor();
  await screenshot("05-ledger");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button",{name:/^Order ledger/}).click();
  await page.getByRole("heading",{name:"Order ledger",exact:true}).waitFor();
  assert.ok((await receipts()).some(job=>job.status==="delivered"));
  assert.ok((await receipts()).some(job=>job.status==="refunded"));
  await page.setViewportSize({width:390,height:844});
  await screenshot("06-mobile");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await writeFile(`${output}/verification.json`,JSON.stringify({testedAt:new Date().toISOString(),productionUrl:baseURL,paymentMode:"sandbox",aiMode:"live",passed:true,desktopViewport:{width:1920,height:1080},results,checks:["real Standard guest-card Sandbox approval and capture","live Nebius content and QC","Markdown download","real full Sandbox refund after two forced QC failures","stale paid receipt cannot regenerate or refund delivery","signed ledger survives reload","mobile overflow"]},null,2)+"\n");
  console.log("Live Sandbox browser capture passed.");
}
