# LARP ESP32 controller benches

Two independently runnable Wokwi projects, accessible from the server-room flowchart. These are **isolated benches**, not new board instances connected to the parking API. The existing nine-bay bridge is unchanged.

**Always-running mode:** Docker's `controller-labs` service starts both benches without opening the app. Popups view live circuit images and UART output from those sessions; closing a popup/browser does not stop them. See [background operation and limits](../docs/implementation/34_ALWAYS_RUNNING_WOKWI.md). `runtime.mjs`, `state.mjs` and `server.mjs` implement the runner and read-only viewer; `tests/` covers freshness, restart identity and HTTP behavior.

- [Flow controller: eight addressed peer models](https://wokwi.com/projects/478617661913436161)
- [Bay controller: six ultrasonic channels](https://wokwi.com/projects/478617786841854977)
- [Operating guide, limits and verification](../docs/implementation/33_CONTROLLER_WOKWI_BENCHES.md)

`flow/` and `bay/` hold their sketches, Wokwi diagrams and saved project metadata. The flow peer chip is an ideal direction-controlled UART peripheral model, not eight additional CPUs or an RS-485 electrical model. The bay bench exercises the six-channel short-wire HC-SR04 alternative, with individual echo dividers. Unimplemented Ethernet, RF, power and installed sensor-bus tests are not reported as passing.

`generate.mjs` regenerates diagrams and copies source to `parking-prototype/public/controller-labs/`. Regenerate the checked-in ZIPs with `package.ps1` afterwards. Recorded preview PNGs are captured from a verified run, not generated telemetry.

`author-browser.mjs` starts a dedicated headless authoring browser on localhost port 9226; `publish.mjs flow` or `publish.mjs bay` creates a **new public Wokwi project** from local source and writes its URL into that role's `project.json`. Do not use it merely to test existing projects. After publishing a replacement, update the UI URLs and preview/ZIP assets deliberately.

With that dedicated browser still open on its project pages, `node verify-live.mjs flow` and `node verify-live.mjs bay` run bench-only acceptance. Published projects can also be tested directly through the app with `node tests/controller-bench-deployed.mjs` from `parking-prototype`; this does not require the authoring browser.

`evidence/flow-results.json` and `bay-results.json` contain the final successful standalone tests. The older `bay-failure.txt` records the initial GPIO36/39 pad-name mistake, corrected to VP/VN before the successful publication. No physical electronics certification is implied.
