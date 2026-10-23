# BayPilot: wireless-zone circuitry prototype

Circuit: https://wokwi.com/projects/478327634016887809

[Verification record](VERIFICATION.md) | [Component quantities](bom.csv) | [Physical architecture specification](../docs/implementation/17_WIRELESS_FIVE_BAY_ARCHITECTURE.md)

This revision replaces the central Mega's direct bay GPIO with a master, zone gateways and **an independent local receiver/controller at every bollard**. Gateway A serves R-101, R-102, R-103, R-104 and V-01. Gateway B serves V-02, V-03, V-04 and T-01, leaving its fifth slot unused. All nine existing app/3D bay IDs remain available. Entrance and exit booms remain separate lane mechanisms.

## What is simulated

Wokwi currently does not support multiple microcontroller CPUs within one project. The master runs compiled Mega firmware; gateways and bay controllers run separate custom-chip C models. Each local bay controller generates its own STEP/DIR signals and reads its own position switches and ultrasonic sensor. The red parking-barrier image follows actual simulated step pulses and end feedback.

**Radio is an explicitly labelled ideal packet-medium model, not native ESP-NOW or a measurement of RF performance.** Eighteen hidden simulator UART connections connect gateway AIR channels to the nine node RX/TX pairs. They implement addressed packet delivery and return telemetry; they do not conceal central motor/sensor GPIO connections. `radio-map.json` inventories these links and `tests/wiring.test.mjs` checks that no master-to-bay driver/sensor wiring exists. Local motor/sensor/power wiring remains visible.

This model does not implement real radio encryption, key provisioning, RF propagation/interference, battery life or production reboot/session security. Its expiry timestamps use the simulator's shared timebase, which a physical distributed design must replace with an engineered session/lease protocol. Custom-chip controllers are not compiled ESP32 firmware. See [design specification](../docs/implementation/17_WIRELESS_FIVE_BAY_ARCHITECTURE.md) for the intended physical architecture and unresolved bench requirements.

## Run with the existing app and 3D building

From the project root on Windows:

```powershell
.\tools\start-wireless-parking-demo.ps1
# Or include the building/car view:
.\tools\start-wireless-parking-demo.ps1 -ThreeD
```

Open http://127.0.0.1:4177 for the app and actual connected circuit together; the app is at http://127.0.0.1:5175 and the 3D view at http://127.0.0.1:5175/?view=three . The launcher starts a fresh synthetic API/circuit session and preserves the saved standalone SQLite file. It restarts only recorded workspace services and refuses unrelated port owners. The earlier wired demo remains available through `start-full-parking-demo.ps1` without `-Wireless`.

For Docker, use this overlay from the project root. Reset the whole session when switching circuit types:

```sh
docker compose --profile live down
docker compose -f compose.yaml -f compose.wireless.yaml --profile live up -d --build
```

Open http://localhost:8080/?view=three or http://localhost:8080/circuit/. The API and bridge must restart together. The root `compose.current-parking.yaml` wider-workspace overlay can select this circuit by additionally setting its `wokwi-bridge` service's `WOKWI_PROJECT_URL` to the URL above; the smaller product command is the tested starting point for this revision.

The app/server remains the authority for resident ownership, approval and assignment. The USB bridge connects the application to the master; no database credentials or resident ownership records are broadcast to the bay nodes. The circuit itself does not add a production identity/authentication system.

## Try it

1. Wait for fresh healthy telemetry from all nine bays. The master allows a bounded initial discovery period before publishing unavailable nodes, avoiding startup fault incidents for nodes still connecting.
2. Use **Lower V-01** in the full-lot controls. Only that bay should lower through Zone A; its neighbours remain in their own observed states. Park there, then leave; its local controller raises after the clear interval.
3. Repeat for V-04 to exercise Zone B. R-101/R-103 start occupied and DOWN.
4. In the 3D view, use plate VAB 8899 and **Run full guided demo** for R-102. Arrival, entry, parking, departure and exit use the same packet-controlled bay and the existing lane booms.
5. In a separate fault rehearsal, click a receiver chip and set **Radio offline** to 1. After freshness expires, its bay becomes RADIO_OFFLINE/UNKNOWN; another bay should remain healthy. Restore 0 to resume telemetry. An incident/isolated bay may still need the app's management recovery/repair-close operation.
6. Close the current chip's control panel using its **X** before selecting a different device; Escape does not close this Wokwi panel and it can cover the gateways. Set **Zone radio offline** on gateway A. Only its five bays should lose feedback; Zone B remains independent. Restore it and inspect recovery. This is a transport outage, not a physical emergency-stop test.
7. Use the existing plant's **Actuator jam** control or the app hardware lab for a motor fault. A packet acknowledgement must never make the app claim the mechanism reached DOWN.

Enrolled node/zone IDs are fixed in `diagram.json`, rather than exposed as interactive sliders. Do not operate a second independently opened Wokwi simulator and expect it to affect the app's bridge session.

## Firmware and tests

`firmware/wireless_master/wireless_master.ino` is the master source; `sketch.ino` is the generated Wokwi copy. `node.chip.c` implements independent local movement/clearance and `gateway.chip.c` implements the five-peer packet switch. `plant.chip.*` is the existing mechanical feedback model. Regenerate files with `npm run generate` before publishing local source changes. Saving the public Wokwi project is a separate step.

From this folder, with the workspace's Windows Arduino tools available:

```sh
npm run generate
npm run compile
npm test
node tests/live.mjs
```

The local native receiver test uses GCC inside the existing `baypilot-bridge` image. For teammates without that image or Windows tools, run the self-contained offline test target from the project root:

```sh
docker compose -f compose.yaml -f compose.wireless.yaml --profile test run --rm --build wireless-tests
```

The tests execute the actual receiver/gateway C source with a test platform supplying GPIO, mechanics, virtual time and delayed packets. Separate avr8js tests run the compiled master HEX and exercise UART startup noise, discovery and radio reception during USB output. Wiring tests inspect the produced network. These tests do not prove real radio or electrical behavior. The container test target uses the included HEX; source compilation is separate.

The live test starts an isolated API and Vite on 5193, controls both radio zones through the app, records a 3D resident journey and exercises receiver/gateway outages in Wokwi. It writes screenshots, WebM and `evidence/live-results.json`; failure diagnostics remain as dated development history. Internet and the public Wokwi compiler are required. Allow for simulator timing slower than wall-clock time. Avoid simultaneous live tests on this machine.

## Protocol and failure handling

Master-to-node model packets: `C commandId nodeIndex operation deadlineMs holdMs`. Operations U/R/E/N mean unlock, recover, emergency and emergency reset. A command targets a single enrolled node through its gateway. `A` responses confirm acceptance/rejection; `T` reports return position, presence, health, sequence and clearance. The master translates these into the existing nine-bay app telemetry contract, tagged `SIMULATED_WIRELESS`.

The receiver caches recent results so a retry does not restart motion or renew its lease. Expired, wrong-node and wrong-zone requests do not move another bollard. The master retries pending requests within a bounded deadline and marks unreported nodes unavailable after freshness expiry. The local bay state machine continues to guard clearance and movement when its radio is offline. Missing position feedback produces a fault rather than invented success.

The master uses a nonblocking USB output queue so full JSON status frames do not overflow its radio receive buffers. A regression test reproduces this failure. Input filtering discards non-ASCII startup noise that otherwise corrupts command IDs. These fixes matter because a completed movement without the correct acknowledgement is still an uncertain command outcome to the application.

## Power and physical limits

Each bay needs its own controller/radio, motor driver, actuator, presence sensing, two limit switches and protected power. Wireless does not eliminate local wiring or power. The displayed power rails are logical simulator supplies, **not** a validated motor-power diagram. Battery versus local low-voltage supply remains undecided; there is no verified current/torque, driver thermal design, charging scheme, outdoor enclosure, obstruction force or manual-release system here.

Emergency requests in this demo travel over the modeled transport; an offline receiver cannot be assumed to receive one. A real emergency/egress design needs an independently engineered protective path and safe local behavior. This is not a safety-rated wireless system or fire-alarm integration.

References: [Wokwi multiple-controller limitation](https://docs.wokwi.com/faq#how-do-i-use-multiple-microcontrollers-in-a-single-project), [custom chips](https://docs.wokwi.com/chips-api/getting-started), [UART API](https://docs.wokwi.com/chips-api/uart), [hidden simulator connection format](https://docs.wokwi.com/diagram-format).
