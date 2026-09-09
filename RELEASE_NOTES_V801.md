# KX CORPORATE V8.0.1 Commercial RC1 Hotfix

- Fixed startup freeze caused by missing `renderCeoPulse` renderer.
- Added a release-time check that rejects builds with referenced-but-undefined render functions.
- Added view-level recovery so a single UI renderer failure no longer leaves the app stuck on the boot screen.
- Added an inline favicon to remove the harmless `/favicon.ico` 404 from production consoles.
- Added browser-persistent daily hiring usage so refreshing does not visually reset the daily hire counter when the server returns a lower transient value.
- Existing per-employee training-day persistence remains enabled.
- Rebuild synchronizes root/public/out/dist/build/site from one public source.
