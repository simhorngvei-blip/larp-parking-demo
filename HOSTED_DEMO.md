# Try the public LARP demo

**Open:** https://larp-demo.vercel.app/app

**No login or access code is required.**

Open the link and choose a synthetic demo profile. No Vercel account, access request, team membership, cookie or private credential is required. This is a public shared simulation.

## Views

| View | Link | What to try |
| --- | --- | --- |
| User app | https://larp-demo.vercel.app/app | Owner/public profiles, parking map, visitor approval, complaint and EV booking |
| Guard app | https://larp-demo.vercel.app/guard | Find the same complaint and approved visit; inspect operational cases |
| Server room | https://larp-demo.vercel.app/server-room | Select a topology component and inspect observations, UART, schematic and reference bench |
| Service website | https://larp-demo.vercel.app/saas | Read the product introduction and prototype boundaries |
| Connected 3D journey | https://larp-demo.vercel.app/?view=three | Wait for fresh circuit feedback, then use Follow car for an arrival-to-exit journey |
| Scaled virtual building | https://larp-demo.vercel.app/?view=scale-three | Explore the larger building using separate software devices |

App links open directly. The old `/demo-login` link redirects to `/app` without asking for a code. Use the production links above; generated deployment and preview URLs remain protected.

## Shared demonstration limits

The old laptop must remain powered, awake, ventilated, online and running Docker. Wokwi compilation may take several minutes after a restart. The two-core host runs near full CPU and simulations may progress slowly. Coordinate one vehicle journey at a time. Enter only synthetic test data: other reviewers share the same fixture and may see its records.

The independent flow, bay and bollard references start when their component popup is viewed, and close after 45 seconds without a visible viewer. Reopening creates a new ESP32 session and may wait for Wokwi compilation. IDLE and PAUSED views never present old images or readings as live. Vehicle journeys close reference browsers to prioritize the actual parking circuit; after final relock, a still-open viewer can request a new session. Main circuit telemetry continues independently. Captures run only while viewed, and hidden tabs stop polling. A queued command does not confirm movement.

The software developer console, central administration and private engineering APIs remain unavailable. Real ANPR, physical RF/power/actuator tests, production identity and real charger integration are outside this prototype. The scaled building and reference benches are separate software demonstrations.

If the service is starting or unavailable, ask the team to check the laptop and Wokwi sessions, or [run the public source locally](RUN_LOCALLY.md). No team cloud credentials are required for a fresh local installation. The public video in the README is also available independently of the laptop.
