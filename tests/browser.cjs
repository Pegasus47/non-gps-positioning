const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const outputDir = path.resolve(process.env.TEST_OUTPUT_DIR || 'test-results');
const url = process.env.TEST_URL || 'http://127.0.0.1:8080';
async function feed(page, duration, {walk=false,alpha=0,beta=0,gamma=0}={}) {
 await page.evaluate(({walk,alpha,beta,gamma})=>{
  const start=performance.now();
  window.__sensorFeed=setInterval(()=>{
   const direction=new Event('deviceorientation');Object.assign(direction,{alpha,beta,gamma});window.dispatchEvent(direction);
   const value=9.81+(walk?2.5*Math.sin(2*Math.PI*(performance.now()-start)/600):0);
   const motion=new Event('devicemotion');Object.assign(motion,{accelerationIncludingGravity:{x:0,y:0,z:value},acceleration:null});window.dispatchEvent(motion);
  },20);
 },{walk,alpha,beta,gamma});
 await page.clock.runFor(duration);
 await page.evaluate(()=>clearInterval(window.__sensorFeed));
}
async function prepare(browser, permission='granted') {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.addInitScript(result=>{
  for(const name of ['DeviceMotionEvent','DeviceOrientationEvent']) {
   if(!window[name])window[name]=class {};
   Object.defineProperty(window[name],'requestPermission',{value:()=>Promise.resolve(result),configurable:true});
  }
  navigator.geolocation.getCurrentPosition=()=>{throw new Error('GPS must never be called');};
  navigator.geolocation.watchPosition=()=>{throw new Error('GPS must never be called');};
 },permission);
 await page.clock.install();await page.goto(url);return page;
}
(async()=>{
 await fs.mkdir(outputDir, { recursive: true });
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
 const page=await prepare(browser);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.title(),'2D non-GPS positioning system');
 assert.equal(await page.getByRole('button',{name:'Find route'}).count(),0);
 assert.equal(await page.locator('.intro').count(),0);
 assert.ok(await page.locator('#start').isDisabled());
 await page.locator('.settings summary').click();await page.locator('#stride').fill('0.5');
 await page.locator('#enable').click();await feed(page,1400);
 assert.equal(await page.locator('#motion-status').textContent(),'live');assert.ok(await page.locator('#start').isEnabled());
 await page.locator('#start').click();assert.equal(await page.locator('#state-badge').textContent(),'TRACKING');
 await feed(page,1800);assert.equal(await page.locator('#steps').textContent(),'0');
 await feed(page,6000,{walk:true});assert.equal(await page.locator('#steps').textContent(),'10');
 assert.equal(await page.locator('#walked').textContent(),'5.0');assert.ok((await page.locator('#coordinates').textContent()).includes('0.0 / 5.0'));
 await page.locator('#check-b').click();assert.equal(await page.locator('#checkpoint-error').textContent(),'3.00 m error');
 assert.ok((await page.locator('#coordinates').textContent()).includes('0.0 / 5.0'));
 await page.locator('#anchor').click();assert.ok((await page.locator('#coordinates').textContent()).includes('0.0 / 8.0'));
 assert.equal(await page.locator('#checkpoint-error').textContent(),'3.00 m error');
 await feed(page,1400,{alpha:90});await page.locator('#pause').click();
 await feed(page,7200,{walk:true,alpha:90});assert.equal(await page.locator('#steps').textContent(),'22');
 await page.locator('#check-c').click();assert.equal(await page.locator('#checkpoint-error').textContent(),'0.00 m error');
 assert.ok((await page.locator('#coordinates').textContent()).includes('-6.0 / 8.0'));
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
 const csv=await fs.readFile(await download.path(),'utf8');assert.ok(csv.includes('before_correction'));assert.ok(csv.includes('checkpoint'));assert.ok(csv.includes('step_length_m'));assert.ok(csv.includes('"3"'));
 await feed(page,1400,{alpha:90});await page.locator('#pause').click();await page.clock.runFor(2000);
 assert.equal(await page.locator('#status').textContent(),'Sensor readings stopped');assert.ok(await page.locator('#pause').isDisabled());
 await feed(page,1400,{alpha:90});await page.locator('#pause').click();
 await feed(page,100,{alpha:90,beta:75});assert.equal(await page.locator('#status').textContent(),'Phone grip changed');
 await feed(page,1400,{alpha:90});await page.locator('#pause').click();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await page.locator('#status').textContent(),'Page hidden — tracking paused');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(outputDir,'desktop.png'),fullPage:true});
 for(const width of [390,360]) {await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#live-controls').isVisible());await page.locator('#live-b').click();assert.ok((await page.locator('#checkpoint-name').textContent()).includes('B'));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(outputDir,'mobile.png'),fullPage:true});
 await page.locator('#reset').click();assert.ok(await page.locator('#reset-dialog').isVisible());await page.locator('#cancel-reset').click();assert.equal(await page.locator('#steps').textContent(),'22');
 await page.locator('#reset').click();await page.locator('#confirm-reset').click();assert.equal(await page.locator('#steps').textContent(),'0');assert.equal(await page.locator('.measurement').count(),0);assert.ok(await page.locator('#export').isDisabled());
 await page.locator('#ab').fill('0');assert.ok(await page.locator('#start').isDisabled());await page.locator('#ab').fill('10');await page.locator('#bc').fill('5');assert.ok((await page.locator('#setup-note').textContent()).includes('B 10 m'));
 assert.deepEqual(errors,[]);await page.close();
 const denied=await prepare(browser,'denied');await denied.locator('#enable').click();assert.equal(await denied.locator('#status').textContent(),'Motion access was not granted');assert.ok(await denied.locator('#start').isDisabled());await denied.close();
 const noData=await prepare(browser);await noData.locator('#enable').click();await noData.clock.runFor(7500);assert.equal(await noData.locator('#status').textContent(),'No usable sensor data');assert.ok(await noData.locator('#start').isDisabled());assert.ok(await noData.locator('#enable').isEnabled());await noData.close();
 const unsupported=await browser.newPage();await unsupported.addInitScript(()=>{delete window.DeviceMotionEvent;delete window.DeviceOrientationEvent;});await unsupported.goto(url);await unsupported.locator('#enable').click();assert.equal(await unsupported.locator('#status').textContent(),'Phone sensors unavailable');await unsupported.close();
 console.log('PASS: synthetic sensor stream → stationary rejection, 10 detected steps, 3 m checkpoint error, explicit correction, left turn, C arrival; CSV; stale/tilt/hidden pauses; reset; validation; denied/missing/unsupported sensors; desktop and 390/360px layouts; no GPS or JS errors.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
