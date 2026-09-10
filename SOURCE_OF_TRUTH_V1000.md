# KX CORPORATE V10.0 Source of Truth

## Runtime source
The deployable game is the static client in `public/`.

- `public/index.html` — HTML shell
- `public/app.js` — game/client logic
- `public/styles.css` — game UI styles
- `public/config.js` — generated/overridden deployment config
- `scripts/build.js` — generates synchronized deployment roots

`out/`, `dist/`, `build/`, `site/`, and root-level `index.html/app.js/styles.css` are deployment copies. Do not hand-edit those copies. Edit `public/` and run `npm run release`.

The legacy `app/`, `next.config.mjs`, `server.js`, `index.js`, and `game.js` files are historical compatibility material and are not the Render static runtime defined by `render.yaml`.

## Release rule
Before any public build, run:

`npm run release`

A release is blocked when syntax, render references, core business invariants, asset synchronization, browser-native confirm/alert regressions, critical responsive safeguards, or V10 quality checks fail.
