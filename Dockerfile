# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.11.1
FROM node:${NODE_VERSION}-bookworm-slim AS app-build
WORKDIR /workspace/parking-prototype
COPY parking-prototype/package*.json ./
RUN npm ci
COPY parking-prototype/ ./
ENV VITE_CIRCUIT_URL=/circuit
RUN npm run build

FROM app-build AS tests
WORKDIR /workspace
COPY wokwi-integrated/viewer.mjs wokwi-integrated/viewer.mjs
COPY wokwi-integrated/tests/viewer.test.mjs wokwi-integrated/tests/viewer.test.mjs
COPY wokwi-integrated/simulation-config.mjs wokwi-integrated/simulation-config.mjs
COPY wokwi-integrated/tests/simulation-config.test.mjs wokwi-integrated/tests/simulation-config.test.mjs
COPY wokwi-controller-labs/state.mjs wokwi-controller-labs/server.mjs wokwi-controller-labs/
COPY wokwi-controller-labs/tests/ wokwi-controller-labs/tests/
CMD ["sh", "-c", "cd parking-prototype && npm test && cd .. && node --test wokwi-integrated/tests/viewer.test.mjs wokwi-integrated/tests/simulation-config.test.mjs wokwi-controller-labs/tests/*.test.mjs"]

FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production PARKING_HOST=0.0.0.0 PARKING_PORT=4176 PARKING_DB=:memory:
WORKDIR /workspace/parking-prototype
COPY --chown=node:node parking-prototype/server/ ./server/
RUN mkdir data && chown node:node data
USER node
EXPOSE 4176
CMD ["node", "server/http.mjs"]

FROM node:${NODE_VERSION}-bookworm AS bridge
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /workspace/tools/mcp-node
COPY docker/package*.json ./
RUN npm ci && npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
WORKDIR /workspace
COPY --chown=node:node wokwi-integrated/bridge.mjs wokwi-integrated/viewer.mjs wokwi-integrated/command-dispatcher.mjs ./wokwi-integrated/
COPY --chown=node:node wokwi-integrated/simulation-config.mjs ./wokwi-integrated/
COPY --chown=node:node wokwi-parking-lot/bridge.mjs ./wokwi-parking-lot/
COPY --chown=node:node docker/start-bridge.mjs docker/smoke.mjs docker/multilevel-smoke.mjs ./docker/
RUN mkdir -p wokwi-integrated/evidence parking-prototype/data && chown -R node:node wokwi-integrated parking-prototype
USER node
EXPOSE 4177
CMD ["node", "docker/start-bridge.mjs"]

# Independent controller sessions continue when no browser/inspector is open.
FROM bridge AS controller-labs
ENV CONTROLLER_HOST=0.0.0.0 CONTROLLER_PORT=4178
COPY --chown=node:node wokwi-controller-labs/runtime.mjs wokwi-controller-labs/state.mjs wokwi-controller-labs/server.mjs ./wokwi-controller-labs/
COPY --chown=node:node wokwi-controller-labs/flow/project.json ./wokwi-controller-labs/flow/project.json
COPY --chown=node:node wokwi-controller-labs/bay/project.json ./wokwi-controller-labs/bay/project.json
COPY --chown=node:node wokwi-bollard-bench/project.json ./wokwi-bollard-bench/project.json
EXPOSE 4178
CMD ["node", "wokwi-controller-labs/runtime.mjs"]

# Independent offline AVR tests execute the included compiled firmware.
FROM node:${NODE_VERSION}-bookworm-slim AS circuit-tests
WORKDIR /workspace/wokwi-parking-lot
COPY wokwi-parking-lot/package*.json ./
RUN npm ci
COPY wokwi-parking-lot/tests/ ./tests/
COPY wokwi-parking-lot/diagram.json ./diagram.json
COPY wokwi-parking-lot/evidence/full-lot.hex ./evidence/full-lot.hex
CMD ["node", "--test", "tests/full-lot.test.mjs", "tests/wiring.test.mjs"]

FROM nginx:1.28.0-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=app-build /workspace/parking-prototype/dist/ /usr/share/nginx/html/
EXPOSE 80

FROM web AS developer
COPY docker/nginx-creator.conf /etc/nginx/conf.d/default.conf

# Native platform harness executes the same receiver/gateway C sources as Wokwi.
FROM node:${NODE_VERSION}-bookworm AS wireless-tests
WORKDIR /workspace/wokwi-parking-lot
COPY wokwi-parking-lot/package*.json ./
RUN npm ci
COPY wokwi-parking-lot/tests/rig.mjs ./tests/rig.mjs
COPY wokwi-parking-lot/evidence/full-lot.hex ./evidence/full-lot.hex
WORKDIR /workspace/wokwi-wireless-lot
COPY wokwi-wireless-lot/ ./
RUN ln -s /workspace/wokwi-wireless-lot /src
ENV WIRELESS_NATIVE=1
CMD ["npm", "test"]

# ESP32 master logic + native receiver/gateway tests; CPU binary is compiled separately.
FROM node:${NODE_VERSION}-bookworm AS esp32-tests
WORKDIR /workspace/wokwi-esp32-lot
COPY wokwi-esp32-lot/ ./
RUN ln -s /workspace/wokwi-esp32-lot /src
ENV WIRELESS_NATIVE=1
CMD ["npm", "test"]
