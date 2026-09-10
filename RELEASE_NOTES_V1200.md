# KX CORPORATE V12.0 - Reality Consistency

V12.0 focuses on business-state plausibility rather than adding more surface features.

## Ownership and control
- Player-founded independent companies no longer silently lose founder/management control because of stale aggregate outside-ownership fields.
- Shareholder ledger is the primary ownership source; legacy `incoming_stake` is only a fallback when no shareholder rows exist.
- Passive outside ownership is reconciled against the voting cap. A founder-controlled player company keeps at least 51% unless an explicit founder stake, live takeover/control contest, or parent-company state proves otherwise.
- Founder/management voting rights + outside shareholder voting rights always reconcile to 100% in the control desk.
- Hostile takeover stake is shown separately from ordinary outside ownership.

## Reality fixes beyond ownership
- New local companies start as founder-controlled companies with realistic early-stage staffing and capitalization.
- Active companies cannot have zero issued shares.
- Department headcounts cannot exceed total employees.
- Overseas share and overseas operating level cannot contradict each other.
- Tax-audit cash/debt shortfall calculation no longer double-counts the cash reduction.
- Cost cutting no longer creates cash out of nowhere; restructuring costs money now and reduces recurring cost later.
- Local share acquisitions include an acquisition premium; disposals include transaction costs.
- Rights issues model dilution, gross proceeds and underwriting/discount costs instead of being a free defensive action.

## Quality gate
- V12 logic tests enforce founder-control continuity, explicit control-loss paths, ownership reconciliation, organization headcount consistency and finance invariants.
- 17 management workspaces still pass render-matrix checks with no exceptions, NaN/undefined leakage, duplicate DOM IDs or empty buttons.
