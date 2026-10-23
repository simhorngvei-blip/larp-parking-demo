# BayPilot full parking-lot Wokwi demo

Circuit: https://wokwi.com/projects/478304280215843841

Combined app and live circuit: http://127.0.0.1:4177

This expands the earlier resident-only circuit to all nine app bays: R-101–R-104, V-01–V-04 and T-01. Each has its own A4988, reversible stepper, HC-SR04 and independent mechanical model with UP/DOWN end switches. The model visibly draws the parking barrier raising and lowering from actual STEP/DIR pulses. Its car appears from actual echo pulse width. The entrance and exit boom servos remain separate mechanisms.

## Launch

From the project root:

```powershell
.\tools\start-full-parking-demo.ps1 -ShowCircuit
```

This restarts only recorded prototype services, loads the updated API, starts a fresh synthetic in-memory SQLite session matching the fresh Wokwi scene, and opens the combined viewer. The standalone app's existing `parking-prototype/data/parking.sqlite` is preserved. Changes made during this circuit rehearsal last for that API session. Internet is needed for Wokwi and its build queue.

If the updated app is already running, `.\tools\start-wokwi-bridge.ps1 -ShowCircuit` starts the full-lot bridge. `-ResidentOnly` selects the previous one-bay circuit. A separately opened public Wokwi page is an independent simulator instance; use the combined viewer to observe the circuit linked to this app.

## Try it

- The numbered resident journey uses VAB 8899 and R-102, including the entrance and exit beams.
- Scroll below that journey to **Full parking lot · nine live barriers**. Other bay cards offer **Lower barrier**, **Park car**, and **Leave bay**. Buttons wait for observed conditions.
- R-101 and R-103 start occupied, with their barriers DOWN. Leave those bays first to watch them raise. Occupied bays cannot be unlocked into a new visit.
- Each bay independently raises after ten continuously clear firmware seconds following confirmed parking/departure. Time-advance buttons do not accelerate Wokwi.
- The full nine-bay simulation can run slower than wall-clock time on this machine. Use the displayed firmware clock when timing clearance; ten controller seconds may take longer than ten real seconds.
- Guardhouse visitor assignments and temporary fallback requests reach their actual Wokwi bay. This preserves approval and reservation rules rather than allocating bays directly from the viewer.
- Hardware-lab jam inputs now reach the corresponding plant. Clearing a jam requests RESET using actual end switches; an actuator stopped between limits still requires a valid recovery/homing design rather than invented position feedback.

## Implementation and verification

The Mega uses two hardware PWM outputs for the boom servos and six pins per bay. `pin-map.json` maps each actuator, limits and presence sensor. `generate-diagram.mjs` emits the wiring, using Wokwi's A0–A13 pin names for the analog header. `firmware/full_lot/full_lot.ino` contains the controller, and `plant.chip.c` contains the ideal mechanism and visible parking-barrier model.

The shared local bridge sends commands through Wokwi's serial monitor, paces serial commands using firmware acknowledgements, applies physical sensor inputs and returns observed telemetry. The API accepts complete ordered nine-bay packets and rejects partial packets. It does not substitute behavioral bay positions while full-lot firmware is connected.

```powershell
cd wokwi-parking-lot
npm test
$env:LOT_COVERAGE='1'
npm run test:live
```

Compiled-AVR tests cover independent bay motion, occupied rejection, jam isolation, missing gate feedback and emergency recovery. The live test checks all nine healthy devices, actual barrier-image changes, visitor allocation, independent parking/departure and the complete resident entrance/exit journey. With LOT_COVERAGE=1 it also cycles every other bay through lower, park, leave and raise. Results and screenshots are in `evidence/`; failed-run diagnostics remain as history.

The visible widget uses Wokwi's [custom-chip display](https://docs.wokwi.com/chips-api/chip-json) and [framebuffer API](https://docs.wokwi.com/chips-api/framebuffer). The controller is Wokwi's supported [Arduino Mega](https://docs.wokwi.com/parts/wokwi-arduino-mega).

## Limits

This is a digital demonstration, not a physical wiring approval. End switches and mechanism movement are ideal models; friction, vehicle collisions, current, power supply sizing, motor torque, braking and ultrasonic crosstalk are not verified. The pictured U-bar is a software mechanical representation of the stepper's modeled position.

Plate authorization remains a synthetic registered-plate match. No camera OCR, production authentication, real fire-alarm connection or 3D building has been added. Visitor bay control is integrated; a distinct visitor entrance-to-exit car journey and simultaneous multi-vehicle lane arbitration remain future work. The circuit viewer is a low-frame-rate read-only image feed, and its freshness warning must be respected after a long idle session or browser interruption.
