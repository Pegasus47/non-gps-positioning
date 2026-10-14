const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../dist/engine.js');
function feed(detector, start, duration, value) { let count = 0; for (let t = start; t < start + duration; t += 20) if (detector.sample(value(t), t)) count++; return count; }
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('stationary gravity, jitter and invalid readings create no steps', () => {
 const d = new P.StepDetector(); assert.equal(feed(d,0,10000,t=>9.81+Math.sin(t)*.08),0);
 assert.equal(d.sample(NaN,10020),false); assert.equal(d.sample(null,10040),false);
});
test('detects synthetic walking peaks at 100 steps/minute', () => {
 const d = new P.StepDetector(); feed(d,0,1000,()=>9.81);
 const count = feed(d,1000,6000,t=>9.81+2.5*Math.sin(2*Math.PI*(t-1000)/600));
 assert.equal(count,10);
});
test('refractory period rejects excessive peak frequency', () => {
 const d = new P.StepDetector(.65); feed(d,0,1000,()=>9.81);
 const count = feed(d,1000,6000,t=>9.81+4*Math.sin(2*Math.PI*(t-1000)/200));
 assert.ok(count<20);
});
test('sensor gap restarts filter and does not count stale peak', () => {
 const d = new P.StepDetector(); feed(d,0,1000,()=>9.81);d.sample(13,1020);
 assert.equal(d.sample(8,4000),false); assert.equal(d.started,4000);
});
test('forward steps and a left turn end at configured B and C', () => {
 const t = new P.Tracker(.5);for(let i=0;i<16;i++)t.step(0,i);close(t.position.x,0);close(t.position.y,8);
 for(let i=0;i<12;i++)t.step(-90,i);close(t.position.x,-6);close(t.position.y,8);close(t.walked,14);assert.equal(t.steps,28);
});
test('position is unconstrained and can move beyond all reference points', () => {
 const t = new P.Tracker(1);for(let i=0;i<20;i++)t.step(90,i);close(t.position.x,20);close(t.position.y,0);
});
test('checkpoint measures error without moving; correction preserves measured result and separates trace', () => {
 const t = new P.Tracker(1);t.step(0,0);const target={x:0,y:8};const m=t.measure('B',target,1);
 close(m.error,7);close(t.position.y,1);t.correct('B',target,2);close(t.position.y,8);close(m.error,7);assert.equal(t.trace.at(-2),null);assert.equal(t.steps,1);
});
test('relative heading wraps across 0/360 and averages circular values', () => {
 close(P.wrap(358-2),-4);close(P.wrap(-179-179),2);assert.ok(Math.abs(P.circularMean([359,1]))<1e-8);
});
test('orientation rejects missing data and converts left/right consistently', () => {
 assert.equal(P.orientation({alpha:null,beta:0,gamma:0}),null);assert.equal(P.orientation({alpha:0,beta:null,gamma:0}),null);
 assert.equal(P.orientation({alpha:90,beta:0,gamma:0}).heading,-90);
 assert.equal(P.orientation({alpha:270,beta:0,gamma:0}).heading,90);
 assert.equal(P.orientation({alpha:0,beta:80,gamma:0}).flat,false);
 assert.equal(P.orientation({alpha:0,beta:0,gamma:0,webkitCompassHeading:123,webkitCompassAccuracy:10}).heading,123);
});
test('invalid vector and step inputs cannot corrupt position', () => {
 assert.equal(P.magnitude({x:null,y:0,z:0}),null);assert.equal(P.magnitude({x:0,y:0,z:9.81}),9.81);
 const t=new P.Tracker();assert.equal(t.step(NaN,0),false);assert.equal(t.steps,0);t.reset();assert.equal(t.records.length,0);
});

test('resuming a primed detector does not discard the first complete step', () => {
 const d=new P.StepDetector();feed(d,0,1400,()=>9.81);d.rearm(1400);
 assert.equal(feed(d,1400,600,t=>9.81+2.5*Math.sin(2*Math.PI*(t-1400)/600)),1);
});
