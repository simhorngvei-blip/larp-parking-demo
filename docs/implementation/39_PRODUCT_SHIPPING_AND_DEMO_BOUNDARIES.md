# LARP: what customers receive and what stays in the lab

Reviewed 23 October 2026 against the source, Android packages, hosted-demo configuration and Team reference documents. LARP means License-plate Automated Recognition Parking. The current deliverable is a working software prototype; none of the interfaces is a production release yet.

## The product we intend to ship

| Surface | Intended audience | What belongs here | Current implementation | Release boundary |
| --- | --- | --- | --- | --- |
| LARP Parking user mobile app | Property owners, residents, visitors and public drivers | Property discovery; floor/bay maps; assigned parking; permitted lowering requests; visitor requests/approvals; EV reservations/session information; complaints and progress | One React user app at `/app`, with homeowner and normal-user experiences driven by entitlements. Android `com.larp.parking` is a debug WebView wrapper | One app, two entitlement-based experiences. No separate owner APK is needed. Real login and ownership verification must replace the synthetic profile selector |
| LARP Guard security mobile app | On-duty guards at assigned properties | Complaint inbox and case updates; patrol records; visitor checks; parking exceptions and escalation | `/guard`; separate debug WebView APK `com.larp.guard` | A guard app, not the technical server-room console. Foreground updates/sound work; native background push and offline submissions do not exist yet |
| LARP Operations server-room dashboard | Property technicians and authorized supervisors | Topology and health; device evidence; component inspection; fault triage; audited operational controls | `/server-room` and legacy `/security` alias; flowchart, selected-device console, planned component schematics, background circuit captures | Intended customer operations product. Wokwi panels are demo evidence and will be replaced by real commissioned-device telemetry. Guard and technician currently share a synthetic security role; production permissions must be split |
| LARP public SaaS website | Buyers, installers and prospective customers | Product explanation, use cases, demonstration and pilot information | `/saas` redirects to `/website/index.html`; built marketing/tour website | This website can introduce the product. It is not a complete subscription or multi-tenant property-management service |
| LARP operator SaaS workspace | Authorized property organizations and portfolio administrators | Tenant/site onboarding, staff access, configuration, ownership integration, commercial service administration and fleet reporting | Some configuration/registry foundations exist in the private central tool; no production operator portal exists | Planned product work. Do not sell the current marketing site or private creator console as this workspace |

The first four are customer-facing surfaces. The operator SaaS workspace is an additional required management capability before a commercial portfolio rollout. The backend, device gateway and database are shared services, not five unrelated applications. Keeping the apps in one source tree is compatible with separate binaries, permissions and deployment entry points.

## Homeowner versus normal user

The same user app checks the account's current homes and entitlements. An activated homeowner can view their assigned bay, initiate authorized residential parking requests and decide visitor requests for their actual unit. A normal/public user explores destinations, requests a visit, uses an approved allocation, books eligible EV slots and reports problems. A user without an assigned home does not gain owner controls by choosing an owner-looking screen.

The current handover flow is a trusted synthetic event, invitation and activation fixture. It does not query a real property-sales CRM, verify a legal buyer, send real invitation email or create production authentication. Those integrations must establish account ownership before owner privileges are enabled. Tenancy transfer and revoked entitlements must invalidate old access without preventing a vehicle already inside from leaving.

Manual lowering remains a permission-checked movement request. A user tap is never physical proof that a bollard is down. Fresh feedback, occupancy checks, local protection and independent limit observations remain necessary. Simulation journey buttons such as Enter/Park/Leave represent vehicle/sensor events; they should disappear from a commercial driver interface.

## What stays private or is removed for production

| Tool or component | Current purpose | Shipping decision |
| --- | --- | --- |
| Standalone developer app, `http://localhost:8081/` | Creator-key-gated fault fixtures, simulated EV observations, time advance, handover replay and scenario inspection | Private engineering tool only. Never embedded into user/guard apps or exposed as a public customer feature |
| Central registry, `/central` | Creator-protected account/controller routing and command journal | Engineering/admin foundation. Not currently an operator SaaS console; its hosted public API routes are blocked |
| Nine-bay connected Wokwi circuit | One compiled ESP32 master with modeled bay nodes, lane barriers and an ideal communication medium | Demo/testing adapter only. Replace with physical controller gateway and measured sensor feedback |
| Flow-controller, bay-controller and single-bollard background benches | Independent ESP32 test cells, persistent circuit images and actual bench UART records | Engineering/technical-demo aids. A bench does not prove the condition of the selected real fleet component |
| Wokwi links and source downloads | Interactive circuit experiments outside the operations viewer | Retain in engineering documentation; do not require customers to run Wokwi |
| 500-bay/10-level 3D journey and scaled-controller model | Explain geometry, addressing and one vehicle's journey at virtual scale | Sales/training/test demonstration. Not 500 physical ESP32s or proof of site throughput |
| User-app 2D/3D parking layout | Help drivers locate floors and bays using server layout/status | Product feature to retain. Map geometry needs a surveyed site plan; unknown/unmonitored bays must not be advertised as vacant |
| Legacy Arduino/AVR and earlier wireless circuit folders | Historical experiments and regression references | Engineering archive; do not procure obsolete boards because these folders exist |
| Docker, Playwright, local APK wrappers and private cloud queue | Reproduction, testing and transitional demo hosting | Deployment/testing infrastructure; packaging and production infrastructure need separate release hardening |
| MiroFish and township research outside this product | Research experiments in the shared workspace | Not required to run or ship LARP |

## How the current demonstration is connected

The Vercel deployment serves the website and protected web interfaces. A Vercel gateway forwards allowed app requests through a private Supabase job queue to one active Docker runtime on the old laptop. That runtime runs the Node application, working SQLite databases, the shared Wokwi bridge and independent background test benches. Committed SQLite checkpoints are stored through the private cloud service for recovery.

Supabase is presently used for a private queue, runtime ownership/lease and compressed SQLite checkpoints. It is not yet the normalized production database for all homeowners, reservations and devices, and Supabase Auth is not integrated into the selectable demo identities. The public website, browser app and APK shell should never receive the service-role key.

Local Docker uses a direct reverse proxy instead of the hosted queue. Ports 8080 and 8081 are separate user/operations and creator entry points. The APKs load local port 8080 through USB `adb reverse`; they do not currently connect independently to the hosted site. A phone with only the APK installed has no database or server inside it.

## Honest diagnosis and parking verification

The server-room flowchart links observed symptoms to the component topology. It cannot identify an uninstrumented failed fuse or radio chip with certainty. Missing heartbeat can mean power loss, cabling, a controller crash or a network problem. Display OBSERVED, INFERRED and NOT MEASURED distinctly; add rail voltage/current, local reset reason, communication counters, independent limits and commissioned component IDs before promising exact part-level diagnosis.

An ultrasonic sensor detects occupancy, not plate identity. Correct-bay enforcement currently relies on authorized allocation, modeled journey events and guard patrol records. Physical identity verification at each bay needs a separately evaluated camera/other identity source; the demo cannot prove that every parked vehicle belongs in its bay.

EV behavior is a software charger adapter. No installed charger/OCPP integration, payment processing or guaranteed battery percentage is demonstrated. Vehicle state of charge is shown only when the adapter supplies a supported fresh observation. Security assistance requires owner consent and observed stop/release; guards must not force a vehicle-side connector lock.

## Release stages and acceptance criteria

1. **Hackathon/demo release:** clearly labelled synthetic profiles, connected nine-bay simulation, independent benches, user/guard Android wrappers, website, server-room viewer, source and operating guide. Keep creator APIs isolated. Demonstrate stale/offline handling as well as the happy path.
2. **Single physical-bay engineering bench:** select the real actuator and driver; verify protected power, electrical levels, independent limits, obstruction protection, emergency/manual recovery and addressed two-way feedback. Test power loss, jam, radio loss and reboot. Wokwi cannot accept these tests on behalf of hardware.
3. **Site-local pilot:** real identity/staff scopes; audited commissioning; 5–6 selected bays; real LPR and vehicle-observation integration; surveyed map; real radio/RS485 and wiring plan; bounded offline decisions and explicit recovery. Agree authority, maintenance owner, incident process and an exit plan before installation.
4. **Commercial release:** signed mobile builds, secure HTTPS configuration, background notifications, production tenancy and authorization, normalized business data, migrations/backups/restore drills, operator portal, retention policy, monitoring, support and contract/SLA review. Enable EV charging only after charger integration acceptance.
5. **Portfolio scaling:** load tests and site-failure isolation, device certificates/keys and rotation, signed firmware/update rollback, customer isolation, per-site observability, capacity planning and proven economics. Neither the 500-bay rendering nor controller address arithmetic establishes this readiness.

## Team reference corrections

The Team commercial PDF gives Team AC/DC, UTM KL and four member names; the deck still has identity placeholders. Use the PDF identity provisionally, but confirm leader, contact and portal fields. The newer BOM uses flow controllers and six-bay controllers. Its 300-bay sheet includes only five flow controllers for fifty bay controllers; at the proposed eight bay controllers per flow controller, seven are required. Retain the source workbook and disclose the reconciliation instead of silently editing team evidence.

The commercial PDF's 20-bay price is RM29,769.73 but its payback example uses approximately RM20,000. At its assumed RM750/month net time value, the former gives 39.7 months, not 26.7 months, before excluded operating costs. Neither figure is a validated quotation or cash-saving forecast. See the proposal's cost reconciliation for the newer 300-bay assumptions.

## Where to start

- Main local app: `http://localhost:8080/app`
- Guard: `http://localhost:8080/guard`
- Server room: `http://localhost:8080/server-room`
- Website: `http://localhost:8080/saas`
- Private developer tool: `http://localhost:8081/`
- Hosted demonstration: `https://larp-demo-rain-s-projects2.vercel.app` (Vercel protection and private team gate apply; not a public judge link yet)
- Android operating guide: [28_LARP_APPS_AND_ANDROID.md](28_LARP_APPS_AND_ANDROID.md)
- Submission handoff: [Proposal README](../../../Proposal/README.md)
