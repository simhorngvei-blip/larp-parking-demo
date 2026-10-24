# LARP

### License-plate Automated Recognition Parking

**From permission to parking — one connected journey.**

LARP brings drivers, homeowners, guards and technical operations into the same parking workflow. Request a visitor pass, prepare an assigned bay, follow a car through the building, and investigate a fault through the server-room dashboard.

Built by **Team AC/DC** for the **Sime Darby Property University Hackathon 2026**. This repository is the runnable software prototype, with simulated vehicles and electronics.

[Watch the silent demo](#demo-video) | [Try the hosted demo](https://larp-demo-rain-s-projects2.vercel.app/demo-login) · [Hosted access guide](HOSTED_DEMO.md) · [Run locally](RUN_LOCALLY.md) · [Verification record](VERIFICATION.json)

## Demo video

https://github.com/user-attachments/assets/43a74e6c-7dcf-4c14-b418-ccf52cb207d1

**Five-minute guided product tour. No narration, music or audio stream.** Press Play above to watch directly in this README.

*The 500-bay building is a virtual demonstration. The connected ESP32/Wokwi demonstration uses a separate nine-bay model.*

**Video:** [Download the five-minute silent MP4](https://github.com/simhorngvei-blip/larp-parking-demo/releases/download/demo-v1/LARP_Alternate_Guided_Tour_5_Minutes_Silent.mp4) | 1080p | 25 fps | no audio stream. The public GitHub Release download needs no Vercel approval or team demo code. The inline attachment and Release download are hosted outside the source Git history, keeping the source checkout small.

## What you can explore

| Experience | What it demonstrates |
| --- | --- |
| **User app** | Separate owner/public experiences, assigned-bay controls, visitor requests and homeowner approvals, parking maps, complaints and EV reservations |
| **Guard app** | Approved visits, complaint handling, patrol observations and parking exceptions |
| **Server-room dashboard** | Device topology, barrier/bollard controls, component inspection, available telemetry, UART evidence and internal connection drawings |
| **3D parking journeys** | Configurable demo plates and bays, multilevel routes, entrance/exit barriers and Follow car cameras |
| **ESP32 simulation** | Connected nine-bay circuit plus independent flow-controller, bay-controller and single-bollard reference benches |
| **Service website** | Public introduction to LARP and its proposed service; a complete operator SaaS portal remains planned |
| **Private developer tool** | A separate local console for circuit, fault and application rehearsals; kept outside the user and guard interfaces |

![Interactive parking layout showing bay locations and simulated occupancy](docs/images/larp-parking-layout.png)

*Parking layout captured from the prototype. Bay state and vehicle identity are separate observations.*

## Try it

**Hosted:** [Open LARP on Vercel](https://larp-demo-rain-s-projects2.vercel.app/demo-login). Access currently requires Vercel approval and a privately supplied LARP demo code. The backend and browser simulations depend on the team's laptop runtime being online. A fresh complete hosted entry/parking/exit/relock test passed on 25 October. Independent reference circuits pause during that journey to give the main circuit CPU priority, then resume; the server room labels them PAUSED. The laptop remains a limited demonstration host. See the [hosted testing guide](HOSTED_DEMO.md) for all routes and access steps.

**Local:** install Docker with Linux containers and Compose, then run:

```sh
git clone https://github.com/simhorngvei-blip/larp-parking-demo.git
cd larp-parking-demo
docker compose up -d --build
```

| Open locally | URL |
| --- | --- |
| User app | http://localhost:8080/app |
| Guard app | http://localhost:8080/guard |
| Server room | http://localhost:8080/server-room |
| Service website | http://localhost:8080/saas |
| Connected 3D journey | http://localhost:8080/?view=three |
| Scaled virtual building | http://localhost:8080/?view=scale-three |

To start the connected circuit and background reference benches as well:

```sh
docker compose -f compose.yaml -f compose.wireless.yaml --profile live up -d --build
```

Initial builds need internet. Wokwi mode also needs internet, browser resources and several minutes of startup time. A fresh local installation needs no team cloud credentials. See [local operation and troubleshooting](RUN_LOCALLY.md) for developer access, stop/resume, data persistence and test commands.

## A useful first walkthrough

1. **Request a visit:** use a public demo profile, request a residential visitor pass, then approve it from the correct homeowner profile.
2. **Handle an exception:** submit a bay-specific parking complaint and acknowledge the same case in the Guard app.
3. **Inspect the system:** select a server-room component and examine its schematic, telemetry and available circuit evidence.
4. **Follow the car:** wait for fresh Wokwi feedback, then run an arrival → entry → parking → departure → exit journey. Select **Follow car** and keep **Cutaway off** for the full-building view.
5. **Explore the larger model:** open the scaled building for a separate virtual multilevel journey. Try an EV reservation in the user app; charging uses a software adapter.

Coordinate shared hosted tests so two testers do not control the same journey at once.

## How it fits together

The React apps and Three.js views share a Node API and SQLite stores. In connected mode, a browser bridge carries commands to the ESP32/Wokwi circuit and returns observed telemetry and circuit captures. Independent controller benches provide reference evidence in the server-room inspector. The scaled building runs a separate virtual device model.

The proposed physical hierarchy is **central application → flow controller → bay controller → bay endpoints**, with feedback returning upstream. The target is **six bays per bay controller and eight bay controllers per flow controller**. The nine-bay connected fixture retains an earlier two-zone allocation; the target hierarchy is not a commissioned physical fleet.

| Source | Purpose |
| --- | --- |
| [`parking-prototype/`](parking-prototype/) | React/TypeScript apps, Three.js scenes, Node API, SQLite stores, Android wrapper source and app tests |
| [`wokwi-esp32-lot/`](wokwi-esp32-lot/) | Current ESP32 master and ideal-radio simulation models |
| [`wokwi-controller-labs/`](wokwi-controller-labs/) · [`wokwi-bollard-bench/`](wokwi-bollard-bench/) | Independent controller and individual-bollard reference sessions |
| [`wokwi-integrated/`](wokwi-integrated/) · [`wokwi-parking-lot/`](wokwi-parking-lot/) | Shared bridge/viewer code and digital test fixtures |
| [`wokwi-wireless-lot/`](wokwi-wireless-lot/) | Native/legacy wireless-model fixtures retained for testing |
| [`docker/`](docker/) · [`Dockerfile`](Dockerfile) · [`compose.yaml`](compose.yaml) | Reproducible local app, circuit and test services |

## Verification and prototype boundaries

The [25 October 2026 verification snapshot](VERIFICATION.json) records a successful frontend build and **185 passing tests**: 162 app tests, 19 controller/viewer/configuration tests and 4 ESP32 model tests. These are software checks, not hardware certification. Reproduce the checks using the commands in [Run locally](RUN_LOCALLY.md#verify).

Plate input and identities are simulated; real ANPR/OCR and production authentication remain to be integrated. Physical radio, actuator power, obstruction sensing, electrical safety and installation require reviewed hardware tests. Occupancy does not identify a vehicle, and missing feedback alone cannot identify an exact failed part. EV booking uses a software charger adapter; real OCPP, billing and guaranteed vehicle charge data are not implemented. Native background push, offline site operation and high availability remain future work.

This focused repository excludes credentials, runtime databases, personal contacts, proposal media, APK binaries, research repositories and installed dependencies. Read [publication scope](PUBLICATION_SCOPE.md) and [product/demo boundaries](docs/implementation/39_PRODUCT_SHIPPING_AND_DEMO_BOUNDARIES.md) for the release gates.

## Team and attribution

**AC/DC · Universiti Teknologi Malaysia (UTM KL)**

Sim Horng Vei · Javen Lim Hao Jun · Mahesh A/L Mahendran · Boey Zhong Han

Original project code is provided for review; this publication does not grant a new open-source license. Adapted UI components and fonts retain their [third-party notices](parking-prototype/THIRD_PARTY_DESIGN.md) and [license texts](parking-prototype/public/licenses/). This hackathon prototype does not imply an installed deployment or an official property-operator partnership.
