# Try the hosted LARP demo

**Open:** https://larp-demo-rain-s-projects2.vercel.app/demo-login

**Website:** https://larp-demo-rain-s-projects2.vercel.app/saas

The hosted prototype is available to approved testers. A signed-out check on 23 October 2026 reached Vercel's login/access page, not the application. Signing in alone does not guarantee permission: the team must arrange approved Vercel access for the tester. LARP then has a separate team demo access-code screen. Obtain that code privately from the team; no access codes, bypass tokens or cloud credentials are published here.

## Before a test session

The team should arrange deployment access, privately provide the LARP demo code, and keep the laptop runtime online with its services and circuit sessions running. Confirm fresh circuit telemetry and capture timestamps before demonstrating motion. Do not assume that a page loading proves the runtime is online. Coordinate shared tests so two people do not send conflicting car or barrier actions during the same journey.

## Open these views after access is granted

| View | Hosted link | What to try |
| --- | --- | --- |
| User app | https://larp-demo-rain-s-projects2.vercel.app/app | Owner/public demo profiles, parking maps, visitor request/approval, complaint and EV reservation |
| Guard app | https://larp-demo-rain-s-projects2.vercel.app/guard | Find the same complaint and approved visit; inspect operational cases |
| Server room | https://larp-demo-rain-s-projects2.vercel.app/server-room | Select a topology component; inspect available device evidence, schematic and reference bench |
| Service website | https://larp-demo-rain-s-projects2.vercel.app/saas | Read the service introduction and prototype boundaries |
| Connected 3D journey | https://larp-demo-rain-s-projects2.vercel.app/?view=three | Wait for fresh circuit feedback, then use Follow car for an arrival-to-exit journey |
| Scaled virtual building | https://larp-demo-rain-s-projects2.vercel.app/?view=scale-three | Explore the larger building; this uses separate software devices |

Synthetic profiles are test identities, not production login. Reference controller benches are independent of the connected fleet. The developer console is a separate private local tool; no hosted developer credential is supplied.

## If access or the runtime is unavailable

- **Vercel sign-in/access screen:** ask the team to grant deployment access. This is separate from the LARP demo code.
- **LARP access-code screen:** enter the privately supplied team demo code after Vercel access is granted.
- **Unavailable service, stale telemetry or missing circuit image:** ask the team to check the laptop runtime, its internet connection and circuit sessions. Do not treat stale observations as successful hardware movement.
- **Independent evaluation:** download this public repository and follow the [Docker quick start](README.md). No team cloud account or access code is needed for a fresh local installation. Connected Wokwi mode still needs internet and simulator availability.

This link is an additional hosted testing option, not an anonymously accessible or guaranteed always-on service. The laptop must remain powered, awake, connected and running the runtime. This guide does not remove deployment protection or supply a public access token.

## 25 October runtime check

A complete hosted arrival/parking/exit/final-bollard-relock journey passed on the old laptop. Browser checks passed for the user, Guard, server-room, both 3D views and website. Complaint delivery/resolution, visitor request/approval and unused EV reservation/cancellation passed through the hosted relay.

During a shared vehicle journey, the three independent reference benches pause so the actual parking circuit gets CPU priority. Their viewers show PAUSED and hide stale images/readings. They resume after the journey and final observed relock; these reference circuits are separate from the main circuit supplying fleet feedback. The laptop still runs near full CPU and simulations may progress slowly. Short acceptance checks do not establish continuous availability or concurrent-user capacity. Keep the laptop powered, awake, online and ventilated, and coordinate vehicle tests one at a time.

Deployment protection and the private team code remain required. The public GitHub repository and video do not grant access to the hosted app.
