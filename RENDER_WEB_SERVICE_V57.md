# Render deployment — V57

Use **Web Service**.

- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/healthz`
- Node: package.json requires Node 20–26

The included `render.yaml` is configured as a Web Service.

After deployment verify `/healthz` returns:
- `version: 5.7.0`
- `deployId: RIFT-V570-BATTLE-PHASE-FX-20260916`

If a phone shows a page saying the project is not a Web Service, the wrong Render service/URL is being opened; deploy the repository as the Web Service defined by `render.yaml` and use that service URL.
