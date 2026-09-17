# KX CORPORATE V10.0 — Steam Quality Gate

This release prioritizes correctness and player trust over adding more surface features.

- Negative company profit/loss values no longer display as zero.
- Company snapshots sanitize malformed numeric data and duplicate companies.
- Valid shareholder rows are preserved even when a display name is missing.
- External ownership is separated from actual hostile takeover threat.
- Passive institutional shareholders do not become hostile attackers without evidence.
- Friendly/management ownership reconciles against total outside ownership.
- M&A shareholder lists aggregate duplicate holder records and use a structured responsive register.
- Transient server errors keep the last valid company snapshot instead of wiping the UI.
- Major company/financial/community actions use anti-double-submit locks.
- Company list analysis preserves its scroll position.
- Semantic UI state keys replace fragile positional `<details>` restoration.
- Build mismatch detection and legacy service-worker/cache retirement reduce stale-deploy regressions.
- Password minimum remains 4 characters as intended by the project rule.
- Release gate now includes VM-level business logic tests and static quality audits.

- Commercial online mode is now server-authoritative: failed money/share/talent requests are never fabricated as successful local results.
- Player-facing patch/server/debug jargon was removed from normal management screens.

- Player-facing failures now sanitize Postgres/PostgREST/JWT/schema/internal exception text while preserving useful business-rule messages such as insufficient cash or daily limits.
- Release diagnostics no longer use inline HTML event handlers, reducing browser/CSP-specific behavior differences.
- The quality gate now fails if raw `err.message` text is directly concatenated into player-facing UI.
