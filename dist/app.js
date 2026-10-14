'use strict';
const $ = id => document.getElementById(id);
const P = Positioning;
const tracker = new P.Tracker(.7);
const detector = new P.StepDetector(1.1);
const NS = 'http://www.w3.org/2000/svg';
let connected = false, connecting = false, started = false, running = false;
let lastMotion = -Infinity, lastDirection = -Infinity, motionSamples = 0;
let headingBuffer = [], absoluteHeading = null, initialHeading = null, relativeHeading = 0;
let directionSource = null, headingInvalid = false, flat = false, accelerationSource = null;
let selectedCheckpoint = null, sessionStarted = null, connectionTimer = null;
let lastPaint = 0, measurements = [], wakeLock = null;
const now = () => performance.now();
const wallTime = () => new Date().toISOString();
const points = () => ({ A: { x: 0, y: 0 }, B: { x: 0, y: Number($('ab').value) }, C: { x: -Number($('bc').value), y: Number($('ab').value) } });
const portrait = () => Math.abs(screen.orientation?.angle ?? window.orientation ?? 0) % 180 === 0;
const validSettings = () => ['ab', 'bc', 'stride'].every(id => $(id).checkValidity() && $(id).value !== '');
const sensorsFresh = () => now() - lastMotion < 1500 && now() - lastDirection < 1500;
const canTrack = () => connected && motionSamples >= 20 && detector.started !== null && now() - detector.started >= 700 && sensorsFresh() && flat && portrait() && !headingInvalid && absoluteHeading !== null;
function message(title, detail) { $('status').textContent = title; $('status-detail').textContent = detail; }
function setBadge(text, live = false) { $('state-badge').textContent = text; $('state-badge').classList.toggle('live', live); }
function controls() {
  $('enable').disabled = connecting || connected || started;
  $('enable').textContent = connected ? 'Sensors connected' : connecting ? 'Connecting…' : 'Enable phone sensors';
  $('start').disabled = started || !canTrack() || !validSettings();
  $('pause').disabled = !started || (!running && !canTrack());
  $('pause').textContent = running ? 'Pause' : 'Resume';
  $('live-controls').hidden = !started; document.body.classList.toggle('in-test', started);
  $('live-pause').textContent = $('pause').textContent; $('live-pause').disabled = $('pause').disabled;
  $('check-b').disabled = $('check-c').disabled = !started;
  $('export').disabled = tracker.records.length === 0;
  for (const id of ['ab', 'bc', 'stride', 'threshold']) $(id).disabled = started;
}
function svgElement(name, attributes, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function plot() {
  if (!validSettings()) return;
  const refs = points(), all = [...Object.values(refs), ...tracker.trace.filter(Boolean)];
  let minX = Math.min(-2, ...all.map(p => p.x)) - 2, maxX = Math.max(2, ...all.map(p => p.x)) + 2;
  let minY = Math.min(0, ...all.map(p => p.y)) - 2, maxY = Math.max(2, ...all.map(p => p.y)) + 2;
  const scale = Math.min(530 / (maxX - minX), 410 / (maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const screenPoint = p => ({ x: 320 + (p.x - cx) * scale, y: 258 - (p.y - cy) * scale });
  minX = cx - 270 / scale; maxX = cx + 270 / scale; minY = cy - 210 / scale; maxY = cy + 210 / scale;
  const grid = $('grid'); grid.replaceChildren(); const axes = $('axes'); axes.replaceChildren();
  const spacing = scale < 12 ? 5 : scale < 22 ? 2 : 1;
  for (let x = Math.ceil(minX / spacing) * spacing; x <= maxX; x += spacing) {
    const a = screenPoint({ x, y: minY }), b = screenPoint({ x, y: maxY });
    grid.append(svgElement('line', { x1: a.x, x2: b.x, y1: a.y, y2: b.y, stroke: x === 0 ? '#bac9bd' : '#e3e9df', 'stroke-width': x === 0 ? 1.3 : .8 }));
    axes.append(svgElement('text', { x: a.x, y: 488, fill: '#809081', 'font-size': 10, 'text-anchor': 'middle' }, String(x)));
  }
  for (let y = Math.ceil(minY / spacing) * spacing; y <= maxY; y += spacing) {
    const a = screenPoint({ x: minX, y }), b = screenPoint({ x: maxX, y });
    grid.append(svgElement('line', { x1: a.x, x2: b.x, y1: a.y, y2: b.y, stroke: y === 0 ? '#bac9bd' : '#e3e9df', 'stroke-width': y === 0 ? 1.3 : .8 }));
    axes.append(svgElement('text', { x: 36, y: a.y + 3, fill: '#809081', 'font-size': 10, 'text-anchor': 'end' }, String(y)));
  }
  axes.append(svgElement('text', { x: 588, y: 510, fill: '#829082', 'font-size': 10, 'text-anchor': 'end' }, 'X (m)'));
  axes.append(svgElement('text', { x: 50, y: 30, fill: '#829082', 'font-size': 10 }, 'Y · forward (m)'));
  $('references').replaceChildren();
  for (const [name, p] of Object.entries(refs)) {
    const s = screenPoint(p);
    $('references').append(svgElement('circle', { cx: s.x, cy: s.y, r: 7, fill: '#fafbf7', stroke: '#245c4f', 'stroke-width': 2 }));
    $('references').append(svgElement('text', { x: s.x + 12, y: s.y - 11, fill: '#194d42', 'font-size': 15, 'font-weight': 600 }, name));
    $('references').append(svgElement('text', { x: s.x + 12, y: s.y + 4, fill: '#718477', 'font-size': 10 }, `(${p.x}, ${p.y})`));
  }
  let pen = false;
  $('trace').setAttribute('d', tracker.trace.map(p => {
    if (!p) { pen = false; return ''; }
    const s = screenPoint(p); const command = pen ? 'L' : 'M'; pen = true; return `${command}${s.x.toFixed(2)},${s.y.toFixed(2)}`;
  }).join(' '));
  const pos = screenPoint(tracker.position);
  $('position').setAttribute('transform', `translate(${pos.x} ${pos.y})`);
  $('heading-arrow').setAttribute('transform', `rotate(${relativeHeading})`);
  $('heading-arrow').style.display = started ? '' : 'none';
}
function render() {
  $('steps').textContent = tracker.steps;
  $('walked').textContent = tracker.walked.toFixed(1);
  $('coordinates').replaceChildren(document.createTextNode(`${tracker.position.x.toFixed(1)} / ${tracker.position.y.toFixed(1)} `), svgUnit());
  $('heading').textContent = started ? `${relativeHeading.toFixed(0)}°` : '—';
  controls(); plot();
}
function svgUnit() { const em = document.createElement('em'); em.textContent = 'm'; return em; }
async function acquireWakeLock() {
  try { if (navigator.wakeLock && running && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* Keep-screen-open guidance remains visible. */ }
  if (!running) releaseWakeLock();
}
function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
function pause(title = 'Tracking paused', detail = 'Position is held. Resume with the same phone grip and direction reference.') {
  if (!started) return;
  if (running) tracker.record('pause', '', wallTime(), relativeHeading);
  running = false; detector.reset(); releaseWakeLock(); setBadge('PAUSED'); message(title, detail); controls();
}
function motion(event) {
  const withGravity = P.magnitude(event.accelerationIncludingGravity);
  const linear = P.magnitude(event.acceleration);
  const value = withGravity ?? linear;
  if (value === null) return;
  const source = withGravity !== null ? 'gravity magnitude' : 'linear magnitude';
  if (accelerationSource !== source) { detector.reset(); accelerationSource = source; }
  lastMotion = now(); motionSamples++;
  const detectedStep = detector.sample(value, lastMotion);
  if (running && canTrack()) {
    if (detectedStep) {
      tracker.step(relativeHeading, wallTime());
      selectedCheckpoint = null; $('anchor').disabled = true;
      render();
    }
  }
  if (lastMotion - lastPaint > 120) { $('signal').textContent = `${detector.filtered.toFixed(2)} m/s²`; lastPaint = lastMotion; }
}
function direction(event) {
  const reading = P.orientation(event);
  if (!reading) return;
  if (directionSource && directionSource !== reading.source && started) {
    headingInvalid = true; pause('Direction reference changed', 'Start a new test at A to establish a fresh forward direction.'); return;
  }
  if (directionSource !== reading.source) headingBuffer = [];
  directionSource = reading.source; flat = reading.flat; lastDirection = now();
  headingBuffer.push({ value: reading.heading, time: lastDirection });
  headingBuffer = headingBuffer.filter(p => lastDirection - p.time < 250).slice(-30);
  absoluteHeading = P.circularMean(headingBuffer.map(p => p.value));
  if (started) relativeHeading = P.wrap(absoluteHeading - initialHeading);
  $('heading-source').textContent = directionSource;
  if (running && (!flat || !portrait())) pause('Phone grip changed', 'Hold the phone flat in portrait, facing your walking direction, then resume.');
  if (started) { $('heading').textContent = `${relativeHeading.toFixed(0)}°`; $('heading-arrow').setAttribute('transform', `rotate(${relativeHeading})`); }
}
function detach() { window.removeEventListener('devicemotion', motion); window.removeEventListener('deviceorientation', direction); }
function resetSensorState() {
  lastMotion = lastDirection = -Infinity; motionSamples = 0; headingBuffer = []; absoluteHeading = null;
  directionSource = null; headingInvalid = false; flat = false; accelerationSource = null; detector.reset();
}
async function enable() {
  if (!window.isSecureContext) { message('HTTPS is required', 'Open the published HTTPS link on your phone. Motion sensors are blocked on ordinary HTTP pages.'); return; }
  if (!('DeviceMotionEvent' in window) || !('DeviceOrientationEvent' in window)) {
    message('Phone sensors unavailable', 'Use Safari on iPhone or Chrome on an Android phone. This browser does not expose the required motion and orientation APIs.'); return;
  }
  connecting = true; controls(); message('Allow motion access', 'Accept the browser prompt, then hold the phone still and flat.');
  try {
    // Both requests originate directly from this tap, preserving the iOS user gesture.
    const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent].map(api => typeof api.requestPermission === 'function' ? api.requestPermission() : Promise.resolve('granted'));
    const permission = await Promise.all(requests);
    if (permission.some(result => result !== 'granted')) throw new Error('permission');
    detach(); resetSensorState();
    window.addEventListener('devicemotion', motion); window.addEventListener('deviceorientation', direction);
    connected = true; connecting = false; controls(); setBadge('WAITING FOR SENSORS');
    message('Waiting for sensor readings', 'Hold still for a moment with the phone flat in portrait.');
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
      if (!sensorsFresh() || motionSamples < 20) {
        connected = false; detach(); controls(); setBadge('NO SENSOR DATA');
        message('No usable sensor data', 'Open this link directly in Safari or Chrome on your phone. Check motion permissions in browser settings, then try again.');
      }
    }, 7000);
  } catch (error) {
    connecting = false; connected = false; controls(); setBadge('ACCESS NEEDED');
    message('Motion access was not granted', 'Allow Motion & Orientation in browser or site settings, then tap Enable phone sensors again.');
  }
}
function start() {
  if (!canTrack() || !validSettings()) return;
  initialHeading = absoluteHeading; relativeHeading = 0; tracker.stride = Number($('stride').value);
  detector.threshold = Number($('threshold').value); tracker.reset(); detector.rearm(now());
  started = running = true; sessionStarted = wallTime();
  tracker.record('start', 'A', sessionStarted, 0); setBadge('TRACKING', true);
  message('Tracking from A', 'Walk naturally toward B. Your steps will move the position marker.');
  render(); acquireWakeLock();
  if (innerWidth <= 720) $('plot').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function checkpoint(name) {
  if (!started) return;
  pause('Checkpoint measured', 'The estimate is paused. Resume to continue, or explicitly correct to this point.');
  const target = points()[name], result = tracker.measure(name, target, wallTime());
  selectedCheckpoint = name; measurements.push(result);
  $('check-result').hidden = false; $('checkpoint-name').textContent = `Point ${name}`;
  $('checkpoint-error').textContent = `${result.error.toFixed(2)} m error`;
  $('checkpoint-detail').textContent = `Estimate (${result.x.toFixed(2)}, ${result.y.toFixed(2)}) · Reference (${target.x}, ${target.y}). Position has not been corrected.`;
  $('anchor').disabled = false;
  drawMeasurements(); controls();
}
function drawMeasurements() {
  $('measurements').replaceChildren();
  if (!measurements.length) { const p = document.createElement('p'); p.className = 'hint empty'; p.textContent = 'Checkpoint measurements will appear here.'; $('measurements').append(p); return; }
  for (const m of [...measurements].reverse()) {
    const row = document.createElement('div'); row.className = 'measurement';
    const label = document.createElement('div'); label.textContent = `Point ${m.landmark}`;
    const small = document.createElement('small'); small.textContent = `${m.steps} steps · estimate (${m.x.toFixed(2)}, ${m.y.toFixed(2)})`; label.append(small);
    const value = document.createElement('strong'); value.textContent = `${m.error.toFixed(2)} m error`; row.append(label, value); $('measurements').append(row);
  }
}
function reset() {
  running = started = false; initialHeading = null; relativeHeading = 0; headingInvalid = false;
  detector.reset(); tracker.reset(); selectedCheckpoint = null; measurements = []; sessionStarted = null;
  $('check-result').hidden = true; drawMeasurements(); releaseWakeLock();
  if (connected) { resetSensorState(); message('New test', 'Stand at A facing B. Hold still for sensor readiness, then start.'); setBadge('WAITING FOR SENSORS'); }
  else { message('Ready to connect', 'Open on your phone in Safari or Chrome and allow motion access.'); setBadge('NOT STARTED'); }
  render();
}
function exportCSV() {
  const config = { step_length_m: tracker.stride, threshold_ms2: detector.threshold, ab_m: Number($('ab').value), bc_m: Number($('bc').value), heading_source: directionSource, session_started: sessionStarted };
  const columns = ['time', 'type', 'landmark', 'steps', 'x', 'y', 'walked', 'heading', 'error', 'targetX', 'targetY', ...Object.keys(config)];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [columns.join(','), ...tracker.records.map(row => columns.map(key => quote(key in config ? config[key] : row[key])).join(','))];
  const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `walking-test-${new Date().toISOString().replaceAll(':', '-')}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('enable').addEventListener('click', enable); $('start').addEventListener('click', start);
$('pause').addEventListener('click', () => {
  if (running) pause();
  else if (started && canTrack()) {
    running = true; detector.rearm(now()); tracker.record('resume', '', wallTime(), relativeHeading);
    selectedCheckpoint = null; $('anchor').disabled = true; setBadge('TRACKING', true);
    message('Tracking resumed', 'Keep the phone facing your walking direction.'); controls(); acquireWakeLock();
  }
});
$('live-pause').addEventListener('click', () => $('pause').click());
$('live-b').addEventListener('click', () => { checkpoint('B'); $('check-result').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('live-c').addEventListener('click', () => { checkpoint('C'); $('check-result').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('check-b').addEventListener('click', () => checkpoint('B')); $('check-c').addEventListener('click', () => checkpoint('C'));
$('anchor').addEventListener('click', () => {
  if (!selectedCheckpoint || running) return;
  tracker.correct(selectedCheckpoint, points()[selectedCheckpoint], wallTime());
  $('checkpoint-detail').textContent = `Position reset to ${selectedCheckpoint}. The measured error remains in the log. Heading is unchanged; resume to continue.`;
  selectedCheckpoint = null; $('anchor').disabled = true; render();
});
$('reset').addEventListener('click', () => { if (tracker.records.length) { if (running) pause(); $('reset-dialog').showModal(); } else reset(); });
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('confirm-reset').addEventListener('click', () => { $('reset-dialog').close(); reset(); });
$('export').addEventListener('click', exportCSV); $('fit').addEventListener('click', plot);
for (const id of ['ab', 'bc', 'stride', 'threshold']) $(id).addEventListener('input', () => {
  if (id === 'threshold') { detector.threshold = Number($('threshold').value); detector.reset(); }
  if (validSettings()) $('setup-note').textContent = `Mark A on the floor, B ${$('ab').value} m ahead, and C ${$('bc').value} m to the left of B.`;
  else $('setup-note').textContent = 'Enter distances from 1–30 m and a step length from 0.20–1.50 m.';
  render();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause('Page hidden — tracking paused', 'Return to this page, hold your phone in the same grip, and resume. Movement while hidden is not counted.'); });
window.addEventListener('pagehide', () => { if (running) pause(); releaseWakeLock(); });
setInterval(() => {
  const motionFresh = connected && now() - lastMotion < 1500;
  const headingFresh = connected && now() - lastDirection < 1500;
  $('motion-status').textContent = motionFresh ? 'live' : connected ? 'waiting' : 'off';
  $('direction-status').textContent = headingFresh ? 'live' : connected ? 'waiting' : 'off';
  $('motion-led').classList.toggle('on', motionFresh); $('direction-led').classList.toggle('on', headingFresh);
  if (running && !sensorsFresh()) pause('Sensor readings stopped', 'Tracking is paused to avoid using stale data. Keep this page active and resume when both sensors are live.');
  if (running && !portrait()) pause('Rotate back to portrait', 'Keep your phone flat in portrait throughout the walk, then resume.');
  if (connected && !started && canTrack()) { setBadge('READY AT A'); message('Ready to set A', 'Stand still at A facing B, then tap Set A & start tracking.'); }
  else if (connected && !started && sensorsFresh() && (!flat || !portrait())) message('Hold the phone flat in portrait', 'Point the top of the phone toward B. Keep this grip throughout the walk.');
  controls();
}, 250);
render();
