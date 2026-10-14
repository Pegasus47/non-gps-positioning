(function (root) {
  'use strict';
  const finite = Number.isFinite;
  const wrap = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function circularMean(values) {
    if (!values.length) return null;
    return Math.atan2(values.reduce((s, v) => s + Math.sin(v * Math.PI / 180), 0), values.reduce((s, v) => s + Math.cos(v * Math.PI / 180), 0)) * 180 / Math.PI;
  }
  function magnitude(vector) {
    return vector && [vector.x, vector.y, vector.z].every(finite) ? Math.hypot(vector.x, vector.y, vector.z) : null;
  }
  function orientation(event) {
    // Fixed portrait grip, phone flat: alpha increases counterclockwise; heading increases clockwise.
    if (![event.beta, event.gamma].every(finite)) return null;
    const flat = Math.abs(event.beta) <= 55 && Math.abs(event.gamma) <= 45;
    if (finite(event.webkitCompassHeading) && (!finite(event.webkitCompassAccuracy) || (event.webkitCompassAccuracy >= 0 && event.webkitCompassAccuracy <= 45))) {
      return { heading: wrap(event.webkitCompassHeading), flat, source: 'compass' };
    }
    return finite(event.alpha) ? { heading: wrap(-event.alpha), flat, source: 'relative orientation' } : null;
  }
  class StepDetector {
    constructor(threshold = 1.1) { this.threshold = threshold; this.reset(); }
    reset() { this.baseline = null; this.filtered = 0; this.lastTime = null; this.started = null; this.lastStep = -Infinity; this.peakStart = null; this.peak = 0; this.armed = true; }
    rearm(time) { this.peakStart = null; this.peak = 0; this.armed = true; this.lastStep = time - 320; }
    sample(value, time) {
      if (!finite(value) || !finite(time)) return false;
      if (this.lastTime === null || time - this.lastTime > 500 || time <= this.lastTime) {
        this.reset(); this.baseline = value; this.lastTime = time; this.started = time; return false;
      }
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.baseline += (1 - Math.exp(-dt / .65)) * (value - this.baseline);
      this.filtered += (1 - Math.exp(-dt / .045)) * (value - this.baseline - this.filtered);
      if (time - this.started < 700) return false;
      if (this.armed && this.filtered > this.threshold && time - this.lastStep >= 320) {
        this.peakStart = time; this.peak = this.filtered; this.armed = false;
      }
      if (this.peakStart !== null) {
        this.peak = Math.max(this.peak, this.filtered);
        if (this.filtered < this.threshold * .25 || time - this.peakStart > 600) {
          const duration = time - this.peakStart;
          const accepted = duration >= 60 && duration <= 600 && this.peak < 12;
          this.peakStart = null;
          if (accepted) { this.lastStep = time; return true; }
        }
      }
      if (this.peakStart === null && this.filtered < this.threshold * .25) this.armed = true;
      return false;
    }
  }
  class Tracker {
    constructor(stride = .7) { this.stride = stride; this.reset(); }
    reset() { this.position = { x: 0, y: 0 }; this.steps = 0; this.walked = 0; this.trace = [{ x: 0, y: 0 }]; this.records = []; }
    step(heading, time) {
      if (!finite(heading) || !finite(this.stride) || this.stride <= 0) return false;
      const angle = heading * Math.PI / 180;
      this.position = { x: this.position.x + this.stride * Math.sin(angle), y: this.position.y + this.stride * Math.cos(angle) };
      this.steps++; this.walked += this.stride; this.trace.push({ ...this.position });
      this.record('step', '', time, heading); return true;
    }
    record(type, landmark, time, heading = null, target = null) {
      const row = { time, type, landmark, steps: this.steps, x: this.position.x, y: this.position.y, walked: this.walked, heading, error: target ? distance(this.position, target) : null, targetX: target?.x ?? null, targetY: target?.y ?? null };
      this.records.push(row); return row;
    }
    measure(name, target, time) { return this.record('checkpoint', name, time, null, target); }
    correct(name, target, time) {
      this.record('before_correction', name, time, null, target);
      this.position = { x: target.x, y: target.y };
      this.trace.push(null, { ...this.position }); // A correction is not a walked segment.
      this.record('correction', name, time);
    }
  }
  const api = { wrap, circularMean, magnitude, orientation, distance, StepDetector, Tracker };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Positioning = api;
})(globalThis);
