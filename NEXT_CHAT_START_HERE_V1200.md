# KX CORPORATE V12.0 handoff

Authoritative baseline: **V12.0 REALITY CONSISTENCY**.

Core product rule: this is a serious, extreme-realism online company-management simulation. Do not add systems that merely look realistic; every displayed state must also be economically and organizationally plausible.

## Non-negotiable invariants
- A player-founded independent company cannot silently become 0% founder/management controlled from passive outside-shareholder data.
- Founder/management voting rights + outside voting rights must reconcile to 100%.
- Ordinary outside ownership and hostile takeover stake are different concepts.
- Loss of control requires evidence: explicit dilution/founder stake, a real control contest/takeover, or parent-company control.
- Employee totals, department totals, payroll, issued shares, overseas presence, cash/debt and ownership data must not contradict each other.
- Server-authoritative economic outcomes remain authoritative in online play.
- Existing working features must not be removed or simplified without a concrete reason.
- Desktop/tablet/mobile must remain readable with no overlap, clipping, accidental scroll resets or hidden controls.

Before new feature work, run `npm run release` and preserve all V12 quality-gate invariants.
