# LARP app source

Use the [repository quick start](../README.md) for Docker, routes, circuit mode and verification. The main app uses React, Three.js and a Node 24 SQLite API. For local source development, run `npm ci`, `npm run api` and (in a separate terminal) `npm run dev`; the complete Docker setup also provides the independent developer interface and circuit proxies. `npm test` and `npm run build` verify the default app suite and frontend.

The synthetic identity selector and software device models are prototype tools. They do not constitute production authentication or physical hardware validation. Android wrapper source is included; APK binaries are supplied separately in the private team handoff. Third-party notices are retained in `THIRD_PARTY_DESIGN.md` and `public/licenses/`.
