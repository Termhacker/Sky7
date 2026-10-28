# SKY7 Stage 3 — Backend and database foundation

This stage adds a separate Express API, a PostgreSQL/Prisma data model, and an idempotent seed for the menu currently shown in `src/scene.js`. The existing Three.js scene has deliberately not been wired to the API yet, to keep this data-layer change isolated from the working visual experience.

## Included

- PostgreSQL local development service in `docker-compose.yml`, bound to localhost only.
- Prisma models for fixed categories, menu items, owner/staff users, business settings, and audit events.
- Menu prices stored as integer kobo (`priceKobo`), not display strings or floating-point currency values.
- Seed data for the six existing categories and all 24 current menu items. Availability flags and chef-pick badges are preserved; image fields remain empty.
- Read-only public API routes: `/api/health`, `/api/categories`, `/api/menu`, `/api/settings/public`.
- Security baseline: Helmet headers, JSON body size limit, CORS allowlist, and API rate limiting.
- Public menu reads omit archived items but retain unavailable items.

## Start locally

1. Copy `server/.env.example` to `server/.env` and set a local database password in `DATABASE_URL`.
2. From the project root, start PostgreSQL: `docker compose up -d postgres`.
3. In `server/.env`, ensure the password matches the compose password. For example, if using the example values, use `change-this-local-password` in both places.
4. Install backend dependencies: `cd server && npm install`.
5. Generate Prisma client: `npm run db:generate`.
6. Apply the checked-in initial migration: `npm run db:deploy`.
7. Generate the Prisma client if needed: `npm run db:generate`.
8. Seed the existing menu: `npm run db:seed`.
9. Start the API: `npm run dev`.

The API will listen on `http://localhost:4000`. Test `http://localhost:4000/api/health` and `http://localhost:4000/api/menu`.

## Important boundaries

- This is the Stage 3 data/API foundation, not the finished owner/staff dashboard.
- Public API is read-only by design. Do not expose unauthenticated menu mutations. Stage 4 adds authentication/authorization before write endpoints are enabled.
- The seed is idempotent by category ID and item slug. It updates the existing seeded item fields on rerun; do not use it after manually editing seeded records unless you intend to restore the prototype values.
- The WhatsApp number is intentionally unset until the owner configures it.
- The frontend still renders its current local scene data. API integration should happen as a separately tested step after the database is running and the API responses have been verified.
- Do not commit `.env` files, database passwords, or secrets.


## Follow-on implementation

The original Stage 3 description above records the state at the backend-foundation checkpoint. The next implementation is documented in [`STAGE-4.md`](./STAGE-4.md) and the current setup details are in [`README.md`](./README.md). Stage 4 adds owner/staff authentication, a protected management workspace and authenticated menu/settings endpoints while keeping the existing public 3D scene as the visual source of truth.
