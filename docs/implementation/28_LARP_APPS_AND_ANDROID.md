# LARP apps, Android packages and SaaS website

LARP means **License-plate Automated Recognition Parking**. This revision separates driver, guard, server-room and private developer experiences while preserving existing accounts, entitlements, circuit journeys and the Docker data volume.

## What to open

| Product | Address | Main task |
| --- | --- | --- |
| User app | http://localhost:8080/app | Home parking, visitor invitations, floor layouts, EV booking and issue reporting |
| Guard app | http://localhost:8080/guard | Live report inbox, patrol checks, visitor ledger and case updates |
| Server room | http://localhost:8080/server-room | Device flowchart, internal parts, evidence, schematics, safe controls and EV assistance |
| Standalone developer app | http://localhost:8081/ | Private component fixtures, circuit controls and user/security scenario testing |
| Central registry | http://localhost:8080/central | Existing creator-protected roster and logical controller registry |
| SaaS website, local copy | http://localhost:8080/saas | Product introduction, interactive tour and pilot-brief download |
| SaaS website, private hosted copy | https://larp-parking-platform.cloudysnail16.chatgpt.site | Same product site, owner-private publication |

The developer app has its own HTML entry, container, local port and creator-key gate. It is absent from user/guard navigation. The old `/developer` address redirects to port 8081. The standalone host does not serve user or security routes; its launch links point back to the main demo. The backend and synthetic fixture data are intentionally shared for testing.

The server-room and guard UIs currently use the same property-scoped synthetic security identities. This is interface separation, not a production staff-permissions implementation. Production deployment needs separate guard/technician authorization in addition to real login.

## Start or rebuild

From the product folder, with Docker Desktop running:

```powershell
docker compose -f compose.yaml -f compose.wireless.yaml --profile live up -d --build --wait --wait-timeout 900
```

The new `developer` service starts with the regular application. Existing Compose project/volume names retain `baypilot` for data compatibility; changing that project name would create a different volume. Do not delete the data volume to rebrand the UI.

To unlock the standalone developer app or central registry, read your local key:

```powershell
docker compose exec -T api cat /workspace/parking-prototype/data/creator-console-key
```

Keep the key private. It is never included in the APK or SaaS website. The demo identity switcher is a test fixture, not production authentication.

## Android APKs

The distributable test files are in [deliverables/android](../../deliverables/android/README.md):

- **LARP-user-demo.apk**: application ID `com.larp.parking`, opens only the user interface.
- **LARP-guard-demo.apk**: application ID `com.larp.guard`, opens only the guard interface.

These are debug-signed **WebView demo packages**, not native/offline implementations or Play Store releases. They require Android 11 or newer and the running application server. They contain the Android shell; the UI and API are loaded from your local demo, so existing users see updated app functionality without rebuilding the wrapper. Native push notifications, background delivery and offline case submission are not implemented.

### Physical Android phone

1. Start the Docker demo on the computer. Install Android SDK Platform Tools and enable USB debugging on the phone. Connect USB and accept the computer's debugging prompt.
2. In PowerShell where `adb` is available, from `deliverables/android`:

```powershell
adb devices
adb reverse tcp:8080 tcp:8080
adb install -r LARP-user-demo.apk
adb install -r LARP-guard-demo.apk
```

3. Open **LARP Parking** or **LARP Guard** on the phone. Keep the computer/server and USB reverse connection available. Repeat `adb reverse` after reconnecting or restarting the device. Reinstalling is normally unnecessary after a frontend-only change.

The APK's `127.0.0.1:8080` is the phone's loopback, forwarded through USB to the computer. Installing the APK alone does not install a server. Copying an APK to another phone without this transport will show the native retry screen. Cleartext is allowed only for this debug loopback; an independent hosted deployment needs HTTPS and a configured trusted app origin.

### Android Studio / emulator

Open [parking-prototype/android](../../parking-prototype/android/README.md). With the local SDK and complete JDK, use:

```powershell
.\Run-AndroidDemo.ps1 -Role user
.\Run-AndroidDemo.ps1 -Role guard
```

The launcher uses a separate ADB port (5038) and the existing `Pixel_8` emulator. Use `-SkipBuild` after the packages are built. An emulator plus Docker/Wokwi can exhaust a 16 GB host; finish build jobs first and close only test-owned processes when memory is constrained. A successful APK build is distinct from emulator UI acceptance.

On this workstation the Android 37 image showed System UI/launcher freezes. Both APKs built and installed, and their WebViews exercised reporting/acknowledgement, but clean native UI acceptance is incomplete. Test on a stable booted emulator (`-AvdName` selects another AVD) or an Android phone. Keep Android System WebView updated.

Rebuild both packages manually from the Android folder:

```powershell
.\gradlew.bat --no-daemon --console plain assembleUserDebug assembleGuardDebug
```

Outputs are `app/build/outputs/apk/user/debug/app-user-debug.apk` and `app/build/outputs/apk/guard/debug/app-guard-debug.apk`. Both use the same activity class with different role-specific application IDs and navigation policies. Guard packages cannot navigate into the server room/developer app; user packages cannot navigate into guard tools.

## Parking map and complaints rehearsal

1. In the user app choose **Alicia Rahman**, then **Explore parking** and a destination. Its **Parking layout** opens with floor buttons. Concordia's nine connected-domain bay IDs follow the connected 3D building: G has R-101/R-102/R-103; L1 has R-104/V-01/V-02; L2 has V-03/V-04/T-01.
2. Click a bay and choose **Report a problem at this bay**. Enter the category, optional observed plate and details. Submit once. Retries with the same request ID do not duplicate the case.
3. Open the guard app using the property's duty identity. A committed complaint publishes a server-sent foreground alert and appears in the inbox. Press **Enable duty sound** to allow the browser's audible ping. Cases remain persisted if the app was closed; reopening loads the inbox.
4. Acknowledge the report, enter an investigation note and resolve it after inspection. The reporter sees the status/history and an in-app notification. Other users and unrelated property guards cannot see or update that case.
5. Use **Record a patrol check** for an observed registration and note. An allocation mismatch is a review finding, not an automatic violation, proof of identity or permission to move the bollard. The guard's patrol ledger does not replace the existing circuit recovery inspection requirements.

Concordia's EV slots are a separate software model. Retail/office floor plans show an illustrative subset, not all bays in the property's aggregate capacity. Uninstrumented normal bays are **UNKNOWN**, not invented vacant observations. All maps are schematic demonstration plans rather than surveyed property drawings.

## Server-room fault tracing

Click a device in **System flow**. The internal schematic lists its component categories, pin/interface information, status, evidence source and timestamp, plus the full reference drawing.

- Central API and SQLite checks reflect this server handling a request and reading the persisted state.
- Existing circuit telemetry can show endpoint health and position. It does not independently measure every converter, radio or firmware task.
- Uninstrumented internal parts remain **UNKNOWN**. Missing telemetry alone cannot distinguish a failed PSU, transceiver, broken cable or software task.
- A component fault injected in the standalone developer app is labelled **DEVELOPER SIMULATION**. It can identify the exact simulated part and whether its category is hardware or software; it is not proof of a measured physical failure. It expires after five minutes unless refreshed.

Test it by unlocking http://localhost:8081/, selecting **BC-001 / Power converter**, adding an evidence note and pressing **Inject component fault**. The server-room node turns faulted; its component card identifies the simulated power fault and the guard receives a duty notification. **Clear component fixture** returns uninstrumented parts to unknown. These fixtures do not actuate hardware or overwrite Wokwi feedback.

Real diagnosis requires independent voltage/current monitoring, bus counters, RF receipt/heartbeat measurements, firmware boot/watchdog/version reports and local limit/obstruction feedback. The component categories and interfaces are prepared; those physical telemetry integrations are not established by the UI.

After a real circuit fault clears, a bay can remain isolated until inspected. In the server-room fleet, select it, enter a local inspection note of at least 12 characters and use **Release inspected repair**. The server requires fresh healthy stable feedback, closed lanes, no emergency/pending command and no unreconciled journey. This closes the repair isolation without moving the actuator. An interrupted vehicle journey must be inspected/reconciled separately first. Maps mark isolated bays unavailable even when presence is clear.

## Data and alerts

Cases, staff updates, patrol records and component fixtures persist in the `operations` section of the existing `public_parking_state` record in `public.sqlite`. This preserves the current prototype storage model; it is not a separate hosted SaaS database.

| Endpoint | Access / purpose |
| --- | --- |
| GET `/api/public/operations/state` | Identity-scoped maps, reports, patrols and permitted diagnostics |
| POST `/api/public/complaints/create` | Active user; known property/bay, supported category and validated details |
| POST `/api/public/complaints/update` | Assigned security; forward status transition and mandatory note |
| POST `/api/public/patrol/record` | Assigned security; observed plate and patrol note |
| POST `/api/public/residential/repair-complete` | Assigned security; verified repair note and fresh safe feedback; no actuator command |
| GET `/api/public/alerts/stream` | Assigned security; committed notifications over a foreground SSE connection |
| POST `/api/public/developer/component` | Creator key + developer identity; explicit synthetic component observation |

The SSE stream uses an authorization header, reconnects after a dropped connection and has polling/inbox fallback. It does not provide guaranteed background push, SMS, emergency dispatch or closed-app Android notifications. Production needs a push provider, durable delivery/retry policy and measured delivery latency.

## SaaS website boundary

The private hosted website introduces LARP, offers an interactive illustrative tour, estimates controller quantities and downloads a pilot-planning Markdown brief. Its local-demo links can be configured with a server origin; doing so does not host or connect the private circuit API automatically. It submits no enquiry and processes no payment.

It is a SaaS product website, not a completed subscription service. Production tenant onboarding, tenant-isolated databases, secure staff login, billing, public availability, device fleet provisioning, retention and incident SLAs remain deployment work. The default private hosted audience is preserved. Source lives in `sites/larp-platform`; a local static copy is served under `parking-prototype/public/website`.

## Verify this revision

```powershell
# parking-prototype folder
npm test
npm run build
node tests/larp-browser.mjs
node tests/residential-browser.mjs
node tests/central-browser.mjs
# Both APKs installed on a booted emulator using ADB port 5038:
node tests/larp-android.mjs
```

The Android test uses an isolated API, submits a real WebView complaint and acknowledges it through the separate installed guard package. Native focus checks reject OS error-dialog screenshots. Evidence lives in `parking-prototype/artifacts/larp`; earlier low-memory emulator failures are not app acceptance evidence.

The new deployed case, component-fault and real Wokwi sensor-fault/recovery checks are recorded in `artifacts/larp/live-results.json`. A separate high-resolution software-rendered 3D replay encountered a telemetry interruption and correctly required staff recovery; it is not recorded as a fresh successful 3D run. Avoid running the emulator, software-rendered 3D and large builds concurrently, and retain the circuit freshness/interlock checks.
