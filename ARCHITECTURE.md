# RIFT DECK v4.0 Architecture

## Runtime
- Node.js dynamic Web Service
- `server.js`: authoritative run/combat/lobby/auth endpoints
- `public/app.js`: client rendering, input, combat choreography
- `public/styles.css`: responsive pixel-game UI and VFX
- `data/catalog.json`: cards, monsters, items, relics, biomes, rules

## Core ownership model
- Permanent: account profile, currencies, captured monsters, spell/card ownership, saved loadout, records
- Run-local: current dungeon/journey roster state, HP, monster forms, spell mastery, relics/items, gold, floor
- Battle-local: active/bench monsters, shields, GENE/RES/RIFT resources, intent, temporary forms, command link

## Monster party
- max 6 selected species
- 10 point budget
- strong species cost more points
- battle starts with first 3 active, remaining members benched
- switching is server-authoritative

## Combat cards
All 315 cards are commands/spells in v4.0.
- attacks and tactical spells
- protection/healing
- monster stat boosts
- GENE / RES / RIFT resource spells
- immediate linked-monster burst attacks

## Transformations
- Standard Evolution: Level + GENE
- Fusion: two monsters contribute GENE and traits
- Resonance Evolution: RES-driven temporary output form
- Rift Bloom: low-HP + RIFT high-risk form

Each monster has concrete art paths for base/evolution/resonance/rift forms.

## Persistence
Supabase is used when configured; local JSON remains a development fallback.
Required Render environment values for cloud auth:
- SUPABASE_URL
- SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY

No additional v4 DB SQL migration is required on top of the existing cloud profile structure.

## Deployment
Build: `npm ci && npm run build`
Start: `npm start`
Health: `/healthz`
