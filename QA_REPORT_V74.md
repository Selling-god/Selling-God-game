# FUSEWILD v7.4 QA Refresh

Release: `FUSEWILD-V740-QA-REFRESH-20260918`

## What was re-checked

- Node syntax: `server.js`, `public/app.js`, `data/move-library.js`.
- Build contract: catalog counts, runtime files, art references.
- Current release test gate: 24/24 tests passed.
- Runtime combat: journey start -> battle -> move events -> lethal HP snapshot -> win/reward transition.
- Multiplayer/auth/cloud room smoke paths.
- Shop cadence, journey capture, evolution, held items, status/command resume, fusion PP, trainer heal.
- Asset integrity: 1,319 PNGs opened successfully; 0 corrupt, 0 fully-transparent, 0 smaller than 32px.
- Catalog art references: no missing runtime art.
- Browser geometry probe (synthetic DOM, Chromium):
  - reward layouts: 1697x849 and 1366x768
  - battle layouts: 360x740, 390x844, 430x932
  - mobile battle grows vertically instead of clipping; move list remains reachable by page scroll.
  - desktop reward middle pane scrolls independently; footer does not overlay reward cards.

## v7.4 containment fixes

- Added final `battle-v74` / `reward-v74` / `afterbattle-v74` containment layer so older CSS cannot re-clamp the current screens.
- Mobile battle/reward pages are no longer forced into a hidden 100dvh container.
- Mobile move cards keep readable type and grow vertically rather than being cropped.
- Generated/long monster and move names are constrained inside their panels.
- Reward middle pane has explicit bottom scroll padding and cannot sit behind the footer.
- Combatants are not dimmed while phases resolve.
- Empty live-status layer is removed after the last status is cured.
- Stale battle-exit timers are cleared when navigating to a non-battle screen.

## Test runner cleanup

Historical version-specific tests are intentionally retained for archaeology, but many assert old version strings or removed UI contracts. `npm test` now runs the curated current release gate via `scripts/run-release-tests.js` instead of treating obsolete contracts as current failures.

## Limitation

The Chromium QA in this environment uses `Page.setDocumentContent` because direct navigation to localhost is blocked by the environment policy. It verifies real browser CSS geometry, but it is not a screenshot of the deployed Render service on a physical phone. Final device validation after deployment is still recommended.
