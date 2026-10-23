# LARP single-bay bollard workbench

Project: https://wokwi.com/projects/478667707556941825

This is a new independent one-bay Wokwi project, not the existing nine-bay lot. It runs an actual ESP32 CPU with Arduino firmware. The A4988/stepper stage and custom mechanical plant are digital actuator surrogates, not the production motor specification or a load/current certification.

Open the server-room app and select a bay such as R-102. Its background viewer shows this circuit's capture and UART without the Wokwi editor. The background instance continues after the popup/browser closes. All selected bays reuse one explicitly independent reference template; this is not telemetry from each fleet bay. Workbench commands do not reach the parking API or change the chosen user's allocated bay.

For interactive experiments, open the separate project link above and press Play there. That separate manual session runs in your browser and ends when closed; it does not control the persistent background viewer. The test steps below apply to that interactive project.

## Try it

1. Wait for BOOT / PASS and telemetry reporting UP. Click the diagram and press F to fit the controls into view.
2. Press LOWER (or send `LOWER` through the Wokwi serial console). Wait for the animated bollard, motor and DOWN feedback.
3. Move the occupancy switch right. RAISE must return FAIL / BAY_OCCUPIED and leave the bollard down.
4. Move occupancy left, wait two seconds and press RAISE. Wait for the UP end stop.
5. Click the animated plant and set Jam to 1. A LOWER request times out after eight simulated seconds; motor drive is disabled and the fault latches. Restore Jam to 0, inspect the inputs/UP limit and send RESET.
6. Switch power, link or safety-loop fixtures right to fail them. Restore the input and explicitly RESET after inspecting the end stop. Hold the red E-STOP to stop motion.

A plant service-position slider allows manual recovery of the ideal mechanics only while motor drive is disabled. Intermediate positions have neither end stop: firmware refuses reset until a stable end position is inspected. A reset is not a motion command.

## What is measured

The firmware reads UP/DOWN GPIOs from a mechanical plant driven by STEP/DIR. It never declares a final position solely from pulse counts or an accepted request. Contradictory limits, missing stable limits, timeout, emergency, open obstruction loop and lost power/link inputs inhibit motion. Occupancy appearing during raising stops the motor.

The occupancy switch emulates information received from a bay controller. The production ceiling ultrasonic sensor remains wired to the bay controller; it is not moved into the bollard by this test. Link and power switches are status fixtures. This bench contains no real RF medium, authentication/replay protocol, voltage/current measurement, converter model or motor load model. NOT_MEASURED UART records disclose those limits. VMOT's external protected supply is reference-only because Wokwi's A4988 model does not simulate that power rail.

## Source and checks

- `sketch.ino`: actual ESP32 pin I/O, serial console and step pulses.
- `control.h`: shared safety/state logic used by both the firmware and compiled native tests.
- `bollard.chip.c` / `.json`: independent ideal mechanism, end stops, jam/service controls and animated bay.
- `diagram.json`: one ESP32, one A4988, one stepper, plant, buttons, status fixtures and LEDs.
- `node --test wokwi-bollard-bench/tests/control.test.mjs`: compile/run safety tests with the local `baypilot-bridge` Docker toolchain.
- `node wokwi-bollard-bench/verify-live.mjs`: verify the published running circuit through the authoring browser on port 9226. This sends commands only to this isolated workbench.
- `node wokwi-bollard-bench/generate.mjs`: regenerate wiring and copy the source into app public assets.
- `powershell -File wokwi-bollard-bench/package.ps1`: refresh the downloadable source ZIP.

Actual Wokwi compile/movement/fault evidence is in `evidence/live-results.json`. No real parking hardware was tested.
