# BayPilot ESP32 parking circuit

Open the [ESP32 Wokwi circuit](https://wokwi.com/projects/478492669342702593). The compiled master is now an **ESP32-WROOM DevKitC v4**, replacing the Mega used in the archived [wireless circuit](../wokwi-wireless-lot/README.md). The nine bay IDs, two five-peer radio zones, entry/exit booms and app protocol remain compatible.

[Executed verification](VERIFICATION.md) | [Circuit/source package](BayPilot-ESP32-Lot-Wokwi.zip). The package includes local ESP32 build artifacts for Wokwi for VS Code; it is a circuit package, not the full workspace release ZIP.

## What changed

- Replaced the actual master CPU and remapped every master connection. GPIO6-11 (flash), input-only pins without internal pullups and boot-strapping pins are not used for the control wiring.
- Replaced AVR timer registers with two 50 Hz ESP32 LEDC servo outputs. Closed/open pulses remain 500/1500 microseconds, matching the existing mechanical feedback model. Both Arduino-ESP32 2.x and 3.x PWM APIs are supported; local compilation used core 3.3.7 and the Wokwi run exercises its own installed core.
- Gateway logic references 3.3 V; boom servos use the board's logical 5 V supply and share a ground. Master GPIO does not drive any bay stepper or sensor.
- Added controller identity `ESP32` to telemetry so the app links to the correct circuit.
- Kept the addressed packet protocol, retries, command IDs, stale feedback rejection, local node clearance, occupied protection and independent lane position feedback.

## Pin map

| Function | ESP32 GPIO |
| --- | --- |
| Emergency input, active HIGH; switch grounds it normally | 4 |
| Entrance / exit beam, active LOW | 32 / 33 |
| Entrance / exit servo PWM | 18 / 19 |
| Entrance open / closed feedback | 21 / 22 |
| Exit open / closed feedback | 23 / 27 |
| Zone A UART RX / TX | 25 / 26 |
| Zone B UART RX / TX | 16 / 17 |
| Status LED output | 13 |
| App bridge | UART0 / serial monitor, 115200 baud |

Machine-readable wiring is in [pin-map.json](pin-map.json); [diagram.json](diagram.json) is the simulator circuit. Physical ESP32 inputs require 3.3 V-compatible signals. In particular, a real HC-SR04 Echo output needs level conversion before an ESP32 input; the current bay sensor/controller wiring is a behavioural model, not a verified physical receiver schematic. Real motors and servos require separately sized protected supplies and common returns; do not power vehicle mechanisms from the ESP32 regulator.

## Run the app and this circuit together

From `Hackathon Final Project`:

```sh
docker compose -f compose.yaml -f compose.wireless.yaml --profile live up -d --build --wait
```

Then open **http://localhost:8080/circuit/** for app and circuit together, or **http://localhost:8080/?view=three** for the nine-bay circuit-driven 3D journey. The separate scaled building at `?view=scale-three` still uses virtual controllers, not this nine-bay Wokwi session.

When migrating an already running older circuit, start a fresh API and bridge together after finishing active journeys. Keep the persistent `demo-data` volume; never delete it to change boards. The team handoff guide describes the migration procedure.

Host launcher: `tools/start-wireless-parking-demo.ps1 -ThreeD` now selects this ESP32 revision. The old AVR sources and tests remain available under `wokwi-wireless-lot` as historical regression/reference material.

## Build and verify

From this folder:

```sh
npm run generate
npm run compile
npm test
node tests/live.mjs
```

`compile.mjs` uses the workspace Arduino CLI and the installed `esp32:esp32:esp32` core. Set `ARDUINO_CLI` to another CLI executable if needed; install the Espressif ESP32 core there first. It produces a real ESP32 `.bin`, `.elf` and merged image under `build/`, with copies and the compile log under `evidence/`. `wokwi.toml` points Wokwi for VS Code to those artifacts. A source-only edit is not automatically published: regenerate, test, and save the corresponding Wokwi files.

The four offline tests cover wiring, the actual master C++ logic through a host GPIO/UART/PWM test adapter, and the actual C gateway/receiver models through their native test platform. The adapter is not an ESP32 CPU emulator; local Xtensa compilation and live Wokwi runs provide separate processor/platform checks.

For a teammate without the Windows toolchain, from the project root:

```sh
docker compose -f compose.yaml -f compose.wireless.yaml --profile test run --rm --build esp32-tests
```

The live test creates its own API and Vite on port 5193, uses the saved ESP32 project, checks both bay zones and their barrier images, runs a circuit-driven tenant journey, then tests receiver/gateway outages. It does not reset the running Docker fleet. Run one Wokwi live test at a time.

## Simulator boundary

Only the master is an emulated ESP32 CPU in this combined project. The two gateways and nine bay receiver/controllers remain clearly labelled C behavioural models. Eighteen disclosed hidden UART channels implement the ideal packet medium; no hidden master-to-bay motor wires are used. This is **not** real ESP-NOW, RF coverage testing, radio encryption, physical wiring qualification or an all-ESP32 multi-CPU emulation. See [Wokwi's multiple-controller limitation](https://docs.wokwi.com/faq#how-do-i-use-multiple-microcontrollers-in-a-single-project).

References: [Wokwi ESP32 support](https://docs.wokwi.com/guides/esp32), [Espressif LEDC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html), [Espressif UART API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/serial.html).
