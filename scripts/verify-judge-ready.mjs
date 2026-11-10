import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile, copyFile, mkdir } from 'node:fs/promises';
const OUT = process.env.JUDGE_OUT || '.judge-out';
await mkdir(OUT, { recursive: true });
import { claimFulfillment } from '../lib/fulfillment.js';
import { stateDouble } from '../tests/state-double.js';
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:1440,height:1100}});
const page = await context.newPage();
const checks = [];
const job = {id:'local-return-1111',jobToken:'local-fixture-receipt', productName:'Forma everyday tote',packageId:'launch', amount:'39.00', capturedAmount:'39.00', status:'paid', createdAt:new Date().toISOString(), timeline:[], qcAttempts:[]};
// Exercise the real one-time claim twice against the existing in-memory state
// double. No network or PayPal request is allowed in this setup.
const fetchBefore = globalThis.fetch;
const envBefore = [process.env.STATE_URL, process.env.STATE_SECRET];
let duplicateError;
try {
 process.env.STATE_URL='https://state.test/state'; process.env.STATE_SECRET='local-test-only';
 const state=stateDouble();
 globalThis.fetch=async (url,options)=>{const result=state(url,options);assert.ok(result,'Unexpected network call');return result;};
 const claimedJob={...job,paymentMode:'sandbox',jobNonce:'local-nonce',paypalOrderId:'LOCAL-ORDER',captureId:'LOCAL-CAPTURE',facts:'Cotton canvas; inner pocket.'};
 await claimFulfillment(claimedJob);
 try {await claimFulfillment(claimedJob);} catch(error) {duplicateError={status:error.status,code:error.code,message:error.message};}
 assert.equal(duplicateError.status,409);assert.equal(duplicateError.code,'NONCE_USED');
} finally {
 globalThis.fetch=fetchBefore;
 for(const [i,key] of ['STATE_URL','STATE_SECRET'].entries()) {
  if(envBefore[i]===undefined) delete process.env[key]; else process.env[key]=envBefore[i];
 }
}
let status='paid', fulfillCalls=0;
await context.addInitScript(order => localStorage.setItem('paid-agent-studio-receipts-v2',JSON.stringify([order])),job);
await page.route('**/api/**',async route => {
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/config') return route.fulfill({json:{paymentMode:'sandbox',aiMode:'demo',liveReady:true}});
 if(path==='/api/ledger') return route.fulfill({json:{orders:[{...job,status}]}});
 if(path.endsWith('/fulfill')) {fulfillCalls++; return route.fulfill({status:duplicateError.status,json:{error:duplicateError.message}});}
 return route.fulfill({json:{order:{...job,status,...(status==='delivered'?{bundle:{pdp:{headline:'Forma everyday tote',subheadline:'Cotton canvas with an adjustable strap',bullets:['Inner pocket'],description:['Hand wash only.'],faq:[]}},qcAttempts:[{passed:true}]}:{})}}});
});
try {
 if (!baseline) await page.clock.install();
 await page.goto('http://127.0.0.1:3149/?checkout='+job.id+'&token=LOCAL-APPROVAL');
 await page.waitForFunction(()=>!location.search);
 if(baseline) {
  await page.getByRole('button',{name:'Create my content bundle',exact:true}).click();
  await page.getByText(duplicateError.message,{exact:true}).waitFor();
  checks.push('Return paid state exposed manual fulfill; duplicate-claim HTTP 409 surfaced as a red error.');
  status='generating';
  await page.getByText('Check for a saved result. If work was interrupted, the seller needs to review it before any new attempt.',{exact:true}).waitFor();
  checks.push('Next 3-second poll to generating exposed interruption guidance during active work.');
 } else {
  await page.getByText('Payment confirmed. Drafting and fact-checking your bundle, about a minute.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Create my content bundle',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Check saved result',exact:true}).count(),0);
  await page.getByText('Payment confirmed. Drafting and fact-checking your bundle, about a minute.',{exact:true}).scrollIntoViewIfNeeded();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/ret_01_return.png`,fullPage:true});
  status='generating';await page.waitForTimeout(3300);
  assert.equal(await page.getByText(/If work was interrupted/).count(),0);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/ret_02_progress.png`,fullPage:true});
  // Advance only the browser timer; the local server clock is untouched.
  await page.clock.fastForward(91_000);
  await page.getByRole('button',{name:'Check saved result',exact:true}).waitFor();
  status='delivered';await page.getByRole('button',{name:'Check saved result',exact:true}).click();
  await page.getByText('Quality checks passed. Your launch bundle is ready.',{exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/ret_03_delivered.png`,fullPage:true});
  assert.equal(fulfillCalls,0);checks.push('Paid/generating return has progress, no manual fulfill or interruption warning; after 90s only a read-only result check; delivery appears.');
  await page.unroute('**/api/**');await context.clearCookies();await page.evaluate(()=>localStorage.clear());
  await page.goto('http://127.0.0.1:3149');
  assert.equal(await page.getByRole('textbox',{name:'Ask the studio about your package'}).count(),0);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'media/01-studio.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'media/06-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1100});
  await page.getByRole('button',{name:'Get my quote',exact:true}).click();
  await page.getByRole('button',{name:'Continue to simulated checkout',exact:true}).click();
  await page.getByRole('button',{name:'Simulate $39.00 payment',exact:true}).click();
  await page.getByRole('button',{name:'Create my content bundle',exact:true}).click();
  await page.getByText('Quality checks passed. Your launch bundle is ready.',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Order ledger/}).click();
  const open=page.getByRole('button',{name:/^Open order /});await open.waitFor();
  for(const width of [1440,1280]) {
   await page.setViewportSize({width,height:1100});
   await page.locator('.ledger-grid').scrollIntoViewIfNeeded();
   const box=await open.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width);
   assert.equal(await open.evaluate(e=>!!e.closest('.ag-grid-pinned-right-cells')),true);
   assert.equal(await page.locator('.ag-body-horizontal-scroll-viewport').evaluate(e=>e.scrollLeft),0);
   assert.equal(await page.locator('.ag-row').count(),1);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/${width===1440?'ledger_v3.png':'ledger_v3_1280.png'}`,fullPage:true});
  }
  await copyFile(`${OUT}/ledger_v3.png`,'media/05-ledger.png');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV',exact:true}).click();
  const download=await downloadPromise;const stream=await download.createReadStream();let csv='';for await (const chunk of stream) csv+=chunk;
  assert.ok(csv.includes('Forma everyday tote'));assert.ok(!csv.includes('jobToken'));assert.ok(!csv.includes('local-fixture-receipt'));
  assert.ok(!(await page.locator('body').innerText()).includes('·'));
  await open.click();await page.getByText('Quality checks passed. Your launch bundle is ready.',{exact:true}).waitFor();
  checks.push('Real local simulated order: Open visible and clickable without scrolling at 1440/1280; CSV contains displayed order only, no receipts; one .ag-row; no middle dots.');
 }
 await writeFile(`${OUT}/${baseline?'return_before.json':'judge_verification.json'}`,JSON.stringify({passed:true,mode:'local simulation only',duplicateClaim:duplicateError,checks},null,2)+'\n');
 console.log(JSON.stringify({passed:true,checks},null,2));
} finally {await context.close();await browser.close();}
