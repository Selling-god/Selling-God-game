# FUSEWILD v7 QA REPORT

Validated on 2026-09-17.

- Syntax: server.js / public/app.js / data/move-library.js PASS
- Build: PASS (v7.0.0, 315 cards, 128 items, 205 monsters)
- Manual faint replacement runtime: PASS
- Replacement events: replacement-required / monster-replacement PASS
- Resume command phase after replacement: PASS
- Shop cadence runtime: PASS
- Trainer / biome heal rules: PASS
- Desktop/mobile battle layout: CSS structural guards added for 1366-class desktop, <=900px tablet/mobile, <=480px phone.

Known limitation: legacy v5-v6 tests that hard-code old version numbers are not authoritative for v7 version metadata.
