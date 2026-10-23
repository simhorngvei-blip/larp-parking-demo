# Wireless circuitry verification — 20 October 2026

This revision implements **software models** of a master, two five-peer gateways and nine independent local receiver/controllers. It does not validate real ESP32/ESP-NOW radio, RF range, cryptography, power or vehicle-scale mechanics.

## Checks performed

| Check | Evidence/result |
| --- | --- |
| Master source compilation | Arduino CLI / Mega 2560 compile succeeded: 12,354 bytes flash, 4,501 bytes globals, 3,691 bytes remaining for locals/stack |
| Offline circuitry tests | Five passed: compiled AVR UART-noise handling, startup discovery, radio draining during USB publication; compiled receiver/gateway C behavior; generated wiring topology |
| Native C behavior | Addressed target only; duplicate does not restart movement; wrong-zone/expired requests do not move bays; occupied protection; clear relock; offline transport; jam reports MOTOR_FAULT; second-zone independence |
| Application regression | 44 passed, including a new test ensuring wireless telemetry links to the correct public circuit |
| Frontend | Type check and production build passed; existing large Three.js chunk warning remains |
| Docker offline circuit image | `docker compose -f compose.yaml -f compose.wireless.yaml --profile test run --rm --build wireless-tests`: five passed in Linux amd64 |
| Docker runtime images | Updated API, web and browser bridge images built with the wireless circuit override supported |
| PowerShell launchers | Updated existing launchers and new wireless launcher parsed without errors |
| Compose | Product wireless overlay and live/test service configuration validated |
| Published source | Reloaded https://wokwi.com/projects/478327634016887809 and compared SHA-256 of all eight simulator files with local source after LF normalization; all matched. Hashes in `evidence/published-source.json` |
| Direct Wokwi actuation | Addressed resident arrival lowered R-102 and opened the entrance; other vacant bays stayed UP |
| Online fault-only run | Passed: nine receivers, individual V-04 radio loss/recovery, five-bay gateway-A loss/recovery and unaffected other-zone bays. Saved `evidence/fault-results.json`, explicitly labelled fault-only |
| Full online run | Passed, mode `full`, at `2026-10-19T17:00:46.276Z` (20 October in Malaysia): both radio-zone bay cycles, actual barrier-image changes, full 3D resident entry/parking/exit, single-receiver isolation/recovery and five-bay gateway isolation/recovery |

The successful full online rehearsal is recorded separately in `evidence/live-results.json`. Its five checks are all true. It operated V-01 and V-04 through the app, checked actual barrier-image changes and local relocking, drove the full 3D tenant journey, and then tested receiver/gateway outages. Final R-102 state was UP/CLEAR, both lane booms CLOSED, all nine receivers HEALTHY and session COMPLETE. A fault-only result must not be represented as a full journey result.

## Failures found during implementation

1. **Blocking USB telemetry overflowed radio input.** A compiled-AVR regression reproduced only four of nine reports arriving while USB JSON output blocked polling. A nonblocking shared USB queue fixed the test. Commands and observations still require actual acknowledgements/feedback.
2. **UART startup noise corrupted command IDs.** Live serial diagnostics showed an unexpected non-ASCII prefix. A compiled-AVR test reproduced the altered identity; input filtering now discards that noise. The test passed after the fix.
3. **Discovery emitted premature offline incidents.** The first telemetry frame previously preceded all receiver reports. A failing test now guards the bounded discovery period; absent nodes still become unavailable after the grace period.
4. **Fault-test UI selected a covered control.** Wokwi's custom-chip control panel does not close with Escape and can cover the gateway. Forced clicks then continued changing the previous receiver. Fault tests now explicitly close the panel's close button before selecting another part and use native slider keys. The isolated outage/reconnection test passed afterwards. Node/zone addresses were also removed from interactive sliders; enrollment stays in the diagram configuration.

Earlier failed-run diagnostics remain in `evidence/` as development history. Check result mode/date/source before quoting them. No failed full run is relabelled as a passing fault-only check.

## Limits

- Master is compiled AVR firmware. Receiver/gateway models are custom-chip C programs; the native platform fixture supplies simulator I/O, mechanics, time and packet delivery for tests.
- Eighteen hidden UART connections implement only the disclosed ideal packet medium. No hidden master-to-bay motor/sensor GPIO is used. This is not proof of native ESP-NOW simulation.
- The packet model has bounded retries, recent-command deduplication and shared-time expiry. Production enrollment, authenticated/encrypted transport, reboot/session reconciliation and unsynchronized-clock leases are unfinished.
- An offline node cannot be assumed to receive an emergency request. Physical emergency/egress protection needs a separate engineered design.
- The power rails are logical simulator power. Real motor supplies, driver protection/current, battery charging/life, safe mechanics and site conditions remain unverified.
- A recovered transport resumes telemetry; repairing/closing an application incident and removing bay isolation remains an explicit management action.
- Node SQLite emits its existing experimental warning. The existing Vite development-dependency advisory documented in the 19 October report was not changed by this circuitry work.
- The dated 19 October full-workspace archive remains unchanged; use the new circuitry files/overlay or the separate wireless update package.
