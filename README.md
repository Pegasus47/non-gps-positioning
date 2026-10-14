# 2D non-GPS positioning system

A phone-browser walking experiment using real motion and orientation events. There is no GPS call, floor plan, routing, map matching, simulated-walk control, or automatic snapping to reference points.

Live site: https://waypoint-campus-demo.shadyfir.chatgpt.site

## Run the physical test

1. Measure out three visible floor markers: A at the start, B 8 metres straight ahead, C 6 metres to the left of B. These are defaults; enter your own measured distances (e.g. 5–10 metres). The plot uses A=(0,0), B=(0,AB), C=(-BC,AB).
2. Open the HTTPS site directly in Safari on an iPhone or Chrome on an Android phone, signed into the account that owns this private site. In-app browsers may not expose sensors. Browser/device support varies.
3. For a better initial step length, walk a measured 10 metres and manually count steps. In Calibration & sensor settings, set step length to 10 divided by the count. The default 0.70 m is only an initial estimate.
4. Stand at A facing B. Hold the phone flat, in portrait orientation, with its top edge facing your walking direction. Tap Enable phone sensors and allow the permission prompt. Wait for both sensor indicators to be live and for Ready to set A.
5. While still facing B, tap Set A & start tracking. Walk naturally to B, keeping the same grip. The estimate moves only when steps are detected; rotating the phone changes heading but should not translate the marker.
6. Stop at the real B marker and tap I'm at B. This pauses tracking and records the Euclidean difference between the estimate and measured B. It does not reset your position.
7. For an uncorrected drift test, tap Resume, turn left with the phone, walk to C and tap I'm at C. For a separate correction trial, tap Use this point as my position at B before resuming. The original error remains in the log; the corrected trace begins a new segment.
8. Export CSV before New test. Repeat the same walk several times. Record phone model/browser, detected versus manually counted steps, B error, C error, and whether a correction was applied. Do not interpret one successful walk as an accuracy guarantee.

If the step count is low or high, adjust the step threshold between tests. Lower values are more sensitive and may also count shaking. Settings are locked during a test to keep recorded measurements consistent.

## Sensor handling

- `DeviceMotionEvent.accelerationIncludingGravity`: vector magnitude, a time-based low-pass baseline, smoothing, peak threshold, duration gate and 320 ms minimum step interval. Falls back to acceleration magnitude if gravity-inclusive samples are unavailable.
- `DeviceOrientationEvent`: a relative heading from alpha for the supported flat portrait grip, or WebKit compass heading when valid. A circular mean smooths the last 250 ms. The initial A→B direction defines zero; negative headings are left turns.
- Position update: `x += stepLength * sin(heading)` and `y += stepLength * cos(heading)`. All distances are in metres.
- The phone's orientation is assumed to match the walking direction. There is no independent estimate of body heading. Keep a fixed grip and do not put the phone in a pocket for this experiment.
- Tracking pauses when the page is hidden, motion/direction data is stale, or the phone leaves the supported flat portrait grip. Resume is explicit. Data from a hidden or paused interval is not reconstructed.
- A change of heading source during a test requires a new test at A.
- Screen Wake Lock is requested when supported, but the page should remain visible and the screen awake.
- Permission denial, missing APIs, and missing numeric sensor data are shown explicitly. The app never substitutes simulated movement.

The trace is unconstrained so drift is observable. Turning the phone, hand motion, magnetic interference, browser sensor fusion, missed steps and stride variation can all affect the result. The method is experimental pedestrian dead reckoning, not validated indoor localization.

## Export

CSV rows include start, detected steps, pauses/resumes, checkpoint errors, and explicit position corrections. Fields include timestamp, event type, landmark, cumulative steps, x/y metres, walked metres, relative heading degrees, checkpoint error metres, reference coordinates, configured stride, threshold, reference distances, heading source and session start. Corrections do not add walked distance. Data stays in the current page until exported; refreshing clears the test.

## Run locally

With Python 3, from the extracted project folder:

    python3 -m http.server 8080 --bind 127.0.0.1 --directory dist

Open http://localhost:8080 for desktop UI and automated tests. **For physical phone sensor testing use the published HTTPS URL.** A phone visiting an ordinary HTTP LAN address generally cannot access these sensor APIs. If hosting this yourself, use trusted HTTPS. Opening files directly is not a supported phone test method.

## Reproduce automated checks

With Node.js:

    node --test tests/engine.test.cjs

The browser suite requires Playwright and Chromium. From the repository folder:

    npm install
    npx playwright install chromium

Keep the local server running in another terminal, then run:

    npm run test:browser

By default, the suite uses Playwright's installed Chromium. Set `CHROMIUM_PATH` to use an existing browser executable, and `TEST_URL` to override the local URL. Screenshots are saved to `test-results/` (override with `TEST_OUTPUT_DIR`). Browser tests inject synthetic motion/orientation events and use a controlled clock; these results and screenshots are not real phone evidence.

Test coverage:
- Stationary rejection and synthetic walking peaks; stale samples and invalid values.
- Coordinate integration for forward walking, left turns, and unconstrained off-reference movement.
- Error measurements before explicit correction; broken trace segments at corrections.
- Heading wrap, circular averaging, flat-grip validation and sensor source parsing.
- Browser permissions, missing APIs, no-data timeout, live sensor indicators and start readiness.
- End-to-end event pipeline, checkpoint actions, CSV, stale/tilt/background pauses, reset and input validation.
- Desktop and 390/360-pixel layouts with no horizontal overflow or JavaScript errors.

## Files

- `dist/index.html`: compact tracking interface and reference-point plot.
- `dist/style.css`: responsive layout.
- `dist/engine.js`: pure step detector, orientation helpers and position tracker.
- `dist/app.js`: permissions, live sensor lifecycle, rendering, checkpoints and export.
- `tests/engine.test.cjs`: numerical and detector tests.
- `tests/browser.cjs`: browser regression tests with synthetic sensor streams.

## Validation limits

Automated tests verify software behavior for controlled signals. No physical iPhone/Android walk was performed in this environment. Real-world step count, heading stability, browser permissions and position error must be measured on the actual phone in the intended test area.
