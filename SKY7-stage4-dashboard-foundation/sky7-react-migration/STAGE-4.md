# SKY7 Stage 4 — Owner/staff dashboard foundation

## Added
- `/dashboard` responsive workspace with overview, menu manager, staff access, business settings and activity log.
- Password-hashed owner/staff authentication with persisted expiring opaque sessions in HTTP-only cookies.
- Owner-only staff/settings/audit endpoints; both roles may manage menu items.
- Menu create/edit, integer-kobo pricing, availability, archive/restore, local image uploads and a selected-item preview overlay.
- CLI first-owner creation (`npm run db:create-owner`) and API audit events.

## Preserved
- `src/scene.js`, `src/styles.css`, `reference/index.html`, six fixed menu categories and 24 seeded menu items are retained.
- Public 3D scene has not yet been connected to API data. This isolates dashboard implementation from the visual baseline.

## Local setup
From `server/`:

```bash
npm install
npx prisma db push
npm run db:generate
npm run db:create-owner
npm run dev
```

From project root, in a second terminal:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/dashboard`.

## Verification status
Source-level tests and syntax checks are included. A passing production build and browser tests require dependency installation and execution in the target development environment. Do not mark this stage accepted until those checks pass.

## Next
1. Connect the public Three.js scene to `/api/menu` without redesigning its rendering.
2. Add cart, server-side availability/price revalidation and single-message WhatsApp handoff.
3. Replace local upload storage with durable managed image storage before deployment.
4. Perform role-based API tests, browser tests and production hardening.
