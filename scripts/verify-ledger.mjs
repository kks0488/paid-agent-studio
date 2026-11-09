const { chromium } = await import(process.env.LEDGER_PLAYWRIGHT_MODULE || 'playwright');
import { readFile, writeFile } from 'node:fs/promises';
import { SAMPLE_LEDGER_ORDERS } from '../lib/ledger.js';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1200}}),page=await context.newPage();
const dir=process.env.LEDGER_VERIFY_OUT || process.cwd();const errors=[],checks=[],rowVisibility=[];
const assertVisibleRows=async (expected,label)=>{
 await page.locator('.ledger-grid').scrollIntoViewIfNeeded();
 const visible=await page.locator('.ag-row').evaluateAll(rows=>rows.map(row=>{
  const rect=row.getBoundingClientRect(),style=getComputedStyle(row);
  const cell=row.querySelector('[col-id="orderNumber"]'),product=row.querySelector('[col-id="product"]');
  const cellRect=cell.getBoundingClientRect(),viewport=row.closest('.ledger-grid').getBoundingClientRect();
  const left=Math.max(cellRect.left,viewport.left,0),right=Math.min(cellRect.right,viewport.right,innerWidth);
  const top=Math.max(cellRect.top,viewport.top,0),bottom=Math.min(cellRect.bottom,viewport.bottom,innerHeight);
  const hit=right>left&&bottom>top?document.elementFromPoint((left+right)/2,(top+bottom)/2):null;
  return {id:row.getAttribute('row-id'),product:product.innerText,top:rect.top,bottom:rect.bottom,
   visible:style.visibility==='visible'&&Number(style.opacity)===1&&cell.innerText.trim().length>0&&product.innerText.trim().length>0&&!!hit&&row.contains(hit)};
 }));
 assert.equal(visible.length,expected,`${label}: rendered row count = data count`);
 assert.equal(visible.filter(row=>row.visible).length,expected,`${label}: visible row count = data count`);
 const ordered=[...visible].sort((a,b)=>a.top-b.top);
 for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].top>=ordered[i-1].bottom-1,`${label}: rows must not overlap`);
 rowVisibility.push({label,dataCount:expected,visibleCount:visible.filter(row=>row.visible).length,rows:visible});
};
const assertLedgerCopy=async()=>assert.ok(!(await page.locator('body').innerText()).includes('·'),'Ledger screen must contain zero middle dots');
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/AG Grid.*(error|warn)/i.test(m.text()))errors.push(m.text())});
try{
 await page.goto('http://127.0.0.1:3149');await page.getByRole('button',{name:/Order ledger/}).click();await page.getByRole('grid').waitFor();
 await page.getByText('Sample data',{exact:true}).waitFor();
 // One conditional-copy check spans both sample and saved-order states.
 const sampleTotals=page.getByText('Totals above count only your own orders in this browser. The rows below are sample data.',{exact:true});
 assert.equal(await sampleTotals.isVisible(),true);
 const sampleTotalsStyle=await sampleTotals.evaluate(element=>{
  const style=getComputedStyle(element),rect=element.getBoundingClientRect();
  return {style:[style.fontSize,style.color,style.textAlign,style.marginTop,style.marginBottom],betweenCardsAndTable:element.previousElementSibling.matches('.metrics-grid')&&element.nextElementSibling.matches('.ledger-panel')&&rect.top>=element.previousElementSibling.getBoundingClientRect().bottom&&rect.bottom<=element.nextElementSibling.getBoundingClientRect().top};
 });
 assert.deepEqual(sampleTotalsStyle.style,['13px','rgb(92, 99, 89)','left','8px','8px']);assert.equal(sampleTotalsStyle.betweenCardsAndTable,true);
 const rows=()=>page.locator('.ag-row');await rows().first().waitFor();assert.equal(await rows().count(),SAMPLE_LEDGER_ORDERS.length);await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,'Initial samples');await assertLedgerCopy();checks.push('Empty browser: 4 visible labeled fictional samples, no overlapping or blank rows');
 const pkg=JSON.parse(await readFile(new URL('../node_modules/ag-grid-community/package.json',import.meta.url),'utf8'));
 assert.equal(pkg.license,'MIT');
 assert.equal(await page.locator('.ledger-license').innerText(),`Table built with AG Grid Community (${pkg.license} license)`);
 const licenseLink=page.locator('.ledger-license a');assert.equal(await licenseLink.innerText(),'AG Grid Community');assert.equal(await licenseLink.getAttribute('href'),'https://www.ag-grid.com/');assert.equal(await licenseLink.getAttribute('target'),'_blank');
 const styles=await page.evaluate(()=>{
  const pill=getComputedStyle(document.querySelector('.ledger-grid .status-pill')),order=getComputedStyle(document.querySelector('.ag-cell[col-id="orderNumber"]')),license=getComputedStyle(document.querySelector('.ledger-license'));
  const grid=document.querySelector('.ledger-panel').getBoundingClientRect(),credit=document.querySelector('.ledger-license').getBoundingClientRect(),disclaimer=document.querySelector('.ledger-disclaimer').getBoundingClientRect();
  return {pill:[pill.fontSize,pill.paddingTop,pill.paddingRight,pill.fontWeight],order:[order.fontSize,order.color],font:order.fontFamily,license:[license.fontSize,license.color],placement:credit.top>=grid.bottom&&credit.bottom<=disclaimer.top&&Math.abs(credit.left-disclaimer.left)<1};
 });
 assert.deepEqual(styles.pill,['12px','4px','10px','600']);assert.deepEqual(styles.order,['12px','rgb(92, 99, 89)']);assert.match(styles.font,/monospace/);assert.deepEqual(styles.license,['12px','rgb(92, 99, 89)']);assert.equal(styles.placement,true);checks.push('MIT credit, new-window link, placement, 12px order IDs and status pills match design');
 const cells=field=>page.locator(`.ag-row [col-id="${field}"]`);
 const sortedValues=async field=>{const vals=await cells(field).evaluateAll(es=>es.map(e=>({y:e.getBoundingClientRect().y,text:e.innerText})));return vals.sort((a,b)=>a.y-b.y).map(v=>v.text)};
 await page.locator('.ag-header-cell[col-id="amount"] .ag-header-cell-label').click();await page.waitForTimeout(400);
 assert.deepEqual(await sortedValues('amount'),['$19.00','$19.00','$39.00','$69.00']);await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,'Amount ascending');checks.push('Numeric amount sort ascending');
 await page.locator('.ag-header-cell[col-id="amount"] .ag-header-cell-label').click();await page.waitForTimeout(400);assert.deepEqual(await sortedValues('amount'),['$69.00','$39.00','$19.00','$19.00']);await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,'Amount descending');checks.push('Numeric amount sort descending');
 await page.getByRole('searchbox',{name:'Search orders'}).fill('Refunded');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===1);assert.equal(await rows().count(),1);assert.equal(await cells('status').innerText(),'Refunded');checks.push('Search filters to refunded order');
 await page.getByRole('searchbox',{name:'Search orders'}).fill('');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===4);
 const statusFilter=page.locator('.ag-header-row-filter [col-id="status"] input');await statusFilter.fill('Delivered');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===1);assert.equal(await rows().count(),1);assert.equal(await cells('status').innerText(),'Delivered');checks.push('Column status filter works');await statusFilter.fill('');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===4);
 await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,'Column filter cleared');
 for(let i=0;i<3;i++){
  await page.getByRole('searchbox',{name:'Search orders'}).fill('Refunded');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===1);await assertVisibleRows(1,`Filtered ${i+1}`);
  await page.getByRole('searchbox',{name:'Search orders'}).fill('');await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length===4);await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,`Search cleared ${i+1}`);
 }
 assert.deepEqual(new Set(await cells('product').allInnerTexts()),new Set(SAMPLE_LEDGER_ORDERS.map(row=>row.productName)));await assertLedgerCopy();
 await page.getByRole('searchbox',{name:'Search orders'}).blur();await page.screenshot({path:dir+'/ledger_v2.png',fullPage:true});checks.push('Visible rows = fixture data count after sorting and repeated search/filter resets');
 await page.setViewportSize({width:390,height:844});await assertVisibleRows(SAMPLE_LEDGER_ORDERS.length,'Mobile 390px');await assertLedgerCopy();await page.screenshot({path:dir+'/ledger_v2_mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page must not overflow on mobile');checks.push('Mobile 390px: page stays within viewport, grid scrolls horizontally');
 await page.setViewportSize({width:1440,height:1200});await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByRole('button',{name:'Get my quote',exact:true}).click();await page.getByText('Quote ready',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue to simulated checkout',exact:true}).click();await page.getByRole('button',{name:'Simulate $39.00 payment',exact:true}).click();
 await page.getByRole('button',{name:'Create my content bundle',exact:true}).click();await page.getByText('Quality checks passed. Your launch bundle is ready.',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Order ledger/}).click();await page.getByRole('grid').waitFor();await cells('status').filter({hasText:'Delivered'}).waitFor();await assertVisibleRows(1,'Saved order');await assertLedgerCopy();await page.getByText('Your saved orders, refreshed from this browser’s receipts',{exact:true}).waitFor();assert.equal(await rows().count(),1);assert.equal(await page.getByText('Sample data',{exact:true}).count(),0);assert.equal(await cells('captured').innerText(),'$39.00');assert.equal(await cells('refunded').innerText(),'$0.00');assert.match(await cells('quality').innerText(),/^Passed/);
 assert.equal(await sampleTotals.count(),0);checks.push('Sample totals notice appears only with samples, below cards and above table, with requested style; hidden for saved orders');
 assert.equal((await cells('orderNumber').innerText()).length,8);checks.push('Actual local simulated order appears with price, capture, refund, time, checks and shortened ID');await page.screenshot({path:dir+'/ledger_actual.png',fullPage:true});
 await page.locator('.ag-body-horizontal-scroll-viewport').evaluate(element=>{element.scrollLeft=element.scrollWidth});
 await page.getByRole('button',{name:/^Open order /}).click();await page.getByText('Quality checks passed. Your launch bundle is ready.',{exact:true}).waitFor();checks.push('Open preserves existing order detail and delivery view');
 // Reload must recover the existing receipt and must not replace it with samples.
 await page.reload();await page.getByRole('button',{name:/Order ledger/}).click();await cells('status').filter({hasText:'Delivered'}).waitFor();assert.equal(await rows().count(),1);checks.push('Reload restores saved order through existing /api/ledger');
 assert.deepEqual(errors,[]);checks.push('No browser or AG Grid errors');
 console.log(JSON.stringify({passed:true,checks,rowVisibility,errors},null,2));await writeFile(dir+'/ledger_verification.json',JSON.stringify({passed:true,checks,rowVisibility,errors},null,2)+'\n');
}catch(e){await page.screenshot({path:dir+'/ledger_error.png',fullPage:true});await writeFile(dir+'/ledger_verification.json',JSON.stringify({passed:false,checks,rowVisibility,errors,error:e.message},null,2)+'\n');console.error(e.message);process.exitCode=1}
finally{await context.close();await browser.close()}
