# Connected entrance, parking bay and exit

This is the earlier resident-only circuit. The default launcher now selects the [full nine-bay circuit](../wokwi-parking-lot/README.md). Add `-ResidentOnly` to `start-wokwi-bridge.ps1` when deliberately running this older demo.

**Circuit:** https://wokwi.com/projects/478131710214850561

**App:** http://127.0.0.1:5175 → **Live journey**

**App and circuit together:** http://127.0.0.1:4177

The combined viewer places the interactive app beside live JPEG captures of the exact Wokwi circuit controlled by the bridge. The circuit image updates about twice per second; the state readings come from firmware telemetry. It is a read-only circuit view, with presence and passage controls in the app. Image and firmware freshness are shown separately; stale images are labelled rather than treated as proof of movement.

This replaces the old one-bay presentation with an integrated resident journey. R-102 uses a reversible stepper motor and A4988 driver. Separate servo models represent entrance and exit boom barriers. A custom Wokwi chip supplies automatic ideal movement and end-position feedback by observing the actual STEP/DIR/PWM wires. No manual UP/DOWN switches are required.

## Run the connected demo

The updated API and UI must be running. From the project root:

```powershell
.\tools\start-parking-prototype.ps1
.\tools\start-wokwi-bridge.ps1
```

If the app is already running, start only the bridge. An older API must be restarted to load the bridge routes. The launcher runs Wokwi headlessly and serves the simultaneous viewer at port 4177. Use `.\tools\start-wokwi-bridge.ps1 -ShowCircuit` to also open that viewer in a visible browser. PIDs and logs are under `tools/verification/`. If the bridge is already running, open the viewer link directly.

The local API writes a random bridge credential to ignored `parking-prototype/data/wokwi-bridge-key`. The bridge reads it locally. No local API is exposed publicly, and no credentials are embedded in the public circuit. Wokwi and compilation require Internet access.

## Demonstrate the whole journey

1. Wait for **Connected to the Wokwi circuit**. Enter `VAB 8899` and press **Arrive at entrance**. An unknown plate is rejected without issuing a motor command.
2. Wait for confirmed entrance OPEN, then **Drive through entrance**. This supplies physical lane-beam evidence to the circuit.
3. After the bay is DOWN and passage is observed, press **Reach my bay and park**. The entry beam clears, the barrier closes, and the actual HC-SR04 model is set to 30 cm. Parking confirms after three seconds.
4. Press **Leave my bay**. The sensor is set to 250 cm. The bay stepper automatically reverses after ten continuously clear seconds and returns to its UP end position.
5. Press **Arrive at exit**, wait for exit OPEN, then **Drive through exit** and **Clear exit lane**. The exit barrier closes after its beam clears.
6. The journey becomes COMPLETE. **Start another journey** is available once the bay and both lanes are clear and positions are known.

Controls wait for actual observed conditions. Command delivery, car-location intent, motor motion and end-position confirmation are separate. The app's R-102 map tile uses the Wokwi feedback while the bridge is attached; other bays remain behavioral simulations.

## Integration mechanism

The Uno reads idempotent commands from its documented serial monitor. A local Playwright bridge supplies app commands to that monitor and physical presence/beam inputs through Wokwi's controls. It reads newline-delimited firmware telemetry and returns it to the API. The app does not derive completed movement from its own button presses.

This is a local demonstration bridge that depends on Wokwi's browser UI. It is not an official Wokwi device-control API and may need maintenance if the site changes. The browser is part of the bridge; a separate copy of the public Wokwi page is a standalone circuit and is not automatically connected. Use app controls for the sensor while the bridge runs, rather than editing overlapping sensor dialogs in the circuit tab.

The firmware accepts `id ARRIVE holdMs`, `id EXIT`, and `id RESET`. Use a unique ID of at most 16 characters. It reports command acceptance separately from telemetry. Commands expire locally in the API queue rather than being replayed after a long disconnect. Stale firmware telemetry marks R-102 OFFLINE and prevents new movement requests.

## Validation

```powershell
cd wokwi-integrated
npm test
npm run test:live
```

Five compiled-AVR tests cover a full two-barrier journey with automatic stepper return, blocked-beam hold, actuator jam, duplicate commands and occupied emergency recovery. The live check starts isolated API/UI instances and a fresh Wokwi browser, drives the app, rejects an unauthorized plate, verifies both barrier closures and checks that the displayed stepper returns to its initial angle.

Evidence lives in `evidence/`: `live-results.json`, parked/completed app and circuit screenshots, recorded browser video, the compiled HEX and firmware journey trace. Earlier failed startup screenshots remain diagnostic history; the live result file records the successful run.

## Boundaries

- Native Wokwi tabs can stall when hidden on this Windows setup. The simultaneous viewer avoids that path by displaying captures from the active headless engine. It is a low-frame-rate image feed, not an embedded interactive Wokwi editor.
- Plate recognition is a simulated registered-plate lookup, not a camera/OCR implementation.
- Stepper and servo mechanisms, end switches and beam inputs are software models. Physical forces, supply sizing, braking, homing and safety certification remain unverified.
- This is the resident R-102 integration slice. Visitor/fallback workflows still use the behavioral worker; they are not secretly linked to this one-bay circuit.
- Full restart reconciliation, all visitor fault rehearsals and production authentication remain Stage 4 work before declaring the wider 3D readiness gate complete.
- Existing time-advance buttons advance the behavioral bays, not Wokwi's clock. The Live journey uses real running firmware time.

The previous Stage 3 Uno/servo circuit remains in `parking-circuit/` as its own verified artifact. This expanded controller has its own source, pin map, model and tests.
