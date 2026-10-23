# LARP parking demonstrator

License-plate Automated Recognition Parking — Team AC/DC hackathon prototype.
This repository contains the code needed to run and inspect the local software demo, not the full private workspace.

## Start with Docker

Install Docker Desktop with Linux containers (or Docker Engine + Compose on Linux). Keep internet available for the initial image/dependency downloads. No team cloud credentials or hosted database are required.

```sh
git clone https://github.com/simhorngvei-blip/larp-parking-demo.git
cd larp-parking-demo
docker compose up -d --build
```

| Interface | Local URL |
| --- | --- |
| User app, owner/public profiles | http://localhost:8080/app |
| Guard app | http://localhost:8080/guard |
| Server-room topology and component inspection | http://localhost:8080/server-room |
| SaaS introduction website | http://localhost:8080/saas |
| Connected nine-bay 3D journey | http://localhost:8080/?view=three |
| Independent scaled virtual building | http://localhost:8080/?view=scale-three |
| Private local developer console | http://localhost:8081/ |

To add the connected ESP32 Wokwi circuit and background reference benches:

```sh
docker compose -f compose.yaml -f compose.wireless.yaml --profile live up -d --build
docker compose --profile live ps
docker compose --profile live logs --tail 60 bridge controller-labs
```

Allow several minutes for browser simulations and remote compilation. Wokwi is an external online service; availability, rate limits and browser resource use affect this mode. App-only mode works without a Wokwi connection after images are built, but cannot prove circuit motion. The flow, bay and individual-bollard reference benches are independent of the connected nine-bay fleet. The larger virtual building uses software devices.

## Try the workflow

1. Open `/app`, select a synthetic public profile, request a residential visitor pass, then switch to the correct homeowner profile to approve it. Inspect the approved visit in `/guard`.
2. Create a complaint at an identified bay in the user app; acknowledge that same case in Guard duty. Alerts are foreground application updates.
3. Inspect assigned/vacant/occupied bays in the user map and test EV reservations. EV sessions use a software charger adapter.
4. In `/server-room`, select a component and inspect its topology, evidence and internal connection sheet. A reference bench is not proof that the corresponding physical part is working.
5. In the connected 3D view, configure a demo plate/bay and follow the complete arrival, entry, park, leave and exit sequence. Wait for fresh Wokwi telemetry before driving that journey. The scaled view is a separate virtual demo; enable Follow car and leave Cutaway off for the full-building presentation.

For your private developer console, read the freshly generated local key with:

```sh
docker compose exec -T api cat /workspace/parking-prototype/data/creator-console-key
```

Enter it only at the local developer console. Do not publish it, share it with judges or put it in a URL. The console is a separate local tool; it is not part of the user or guard interfaces.

## Verify

```sh
docker build --target tests -t larp-demo-tests .
docker run --rm larp-demo-tests
docker compose -f compose.yaml -f compose.wireless.yaml --profile test run --build --rm esp32-tests
docker compose --profile test run --build --rm circuit-tests
```

The first image compiles the React/TypeScript frontend and runs the Node app and controller/viewer unit suites. Circuit targets execute digital or native harnesses; they do not certify physical electronics. Historical browser scripts may require their documented local capture fixtures and running services; they are not part of the default unit command.

## Stop, resume and troubleshoot

Use `docker compose --profile live stop` to stop apps and simulators without deleting data. Resume with the same `up` command. API SQLite files and generated local keys live in Docker volumes. `docker compose down -v` deletes those volumes: use it only for an intentional fresh local demo. Do not reset an existing journey or switch firmware variants without inspecting the current state. A stale frame or missing feedback should be treated as unknown, not as a successful command.

Ports 8080 and 8081 must be free. The Compose project and some internal compatibility identifiers retain the legacy `baypilot` name. A second workspace using that project name can collide; stop the other stack first or deliberately choose a separate Compose project and ports. The application brand is LARP.

## Source map

`parking-prototype/`: React, Three.js, Node API, SQLite stores, Android wrapper source and tests. `wokwi-esp32-lot/`: current master and ideal-radio models. `wokwi-controller-labs/` and `wokwi-bollard-bench/`: independent reference sessions. `wokwi-integrated/` and `wokwi-parking-lot/`: bridge/viewer and required test fixtures. `wokwi-wireless-lot/`: native/legacy digital fixtures used by test targets. `docker/`, `Dockerfile` and Compose files: reproducible local runtime. `tools/mcp-node/`: lockfile for optional direct browser-test dependencies, not an installed tool distribution.

## Demo and deployment boundaries

Synthetic identity selection is not production authentication. Plate input is simulated, not OCR. Physical RF, motor power, obstruction sensing, electrical safety, enclosure design and installation are unverified engineering gates. A ceiling occupancy sensor does not identify a vehicle plate. Exact failed-part diagnosis requires appropriate instrumentation; a missing response alone does not prove its root cause. No real OCPP, guaranteed charge percentage, charging payments, native background push, offline site operation or high availability is delivered.

The existing hosted demo is protected and depends on a separate laptop runtime. It is not an anonymous, always-on judging link. This public source repository is the independently accessible alternative; running the connected demonstration still needs a computer, Docker, internet and third-party simulator availability. Cloud credentials, host provisioning, databases, team personal contacts, APK binaries, proposal media, research repositories, capture logs and installed dependencies are intentionally excluded.

Original project code is supplied for review; no new open-source license has been granted by this packaging step. Upstream component/font notices remain in `parking-prototype/public/licenses/` and `parking-prototype/THIRD_PARTY_DESIGN.md`. See `PUBLICATION_SCOPE.md` and `VERIFICATION.json` for the snapshot scope and measured checks.
