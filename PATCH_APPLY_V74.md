# FUSEWILD v7.4 Patch Apply

1. Back up the current repository.
2. Copy the files from the patch ZIP over the same paths in the repository.
3. Commit/push to GitHub.
4. On Render, deploy the Web Service (not a Static Site).
5. Build command: `npm ci && npm run build`
6. Start command: `npm start`
7. Keep your existing Supabase environment variables on the Web Service.
8. After deploy, use a hard refresh / clear the old tab once so the new v7.4 cache-busted CSS/JS is loaded.

Validation: run `npm test`. The expected final line is `RELEASE_GATE_OK`.
