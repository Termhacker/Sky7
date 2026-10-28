# SKY7 — conservative React/Vite migration scaffold

This is a **migration scaffold, not a fully verified production migration**. The original HTML is preserved at `reference/index.html` and remains the visual source of truth.

## What has been changed

- Added a minimal React/Vite entry point and React DOM shell.
- Moved the original CSS to `src/styles.css` without changing its contents.
- Moved the original inline Three.js module to `src/scene.js`. The scene body is preserved; its imports now resolve through the pinned `three` npm package instead of the original HTML import map.
- Added a parity check to catch accidental changes to the extracted CSS or scene body.

## What has not been done

- The project has **not yet passed a Vite production build or migrated-browser test** in the environment where this package was prepared. Dependency installation could not complete because the npm registry was unreachable from that environment.
- The owner/staff dashboard and authenticated API are now implemented as a separate route. The public Three.js scene remains preserved and is not yet API-driven; cart and WhatsApp ordering are still a subsequent integration phase.
- The scene still uses imperative DOM access for the existing controls, but it is now initialized through an explicit `mountScene()` call after React mounts the DOM shell.
- Event listeners are tied to an `AbortController`, pending timers are tracked, the animation frame is cancelled during cleanup, and scene-owned GPU resources are disposed on unmount.
- The migration is still not production-verified: dependency installation timed out in this environment, so the Vite production build and migrated-browser tests remain outstanding.

## Requirements

Node.js 18+ and npm, with network access to the npm registry for the first install.

## Install and run

```bash
npm install
npm run dev
```

Open the local Vite URL and compare it with `reference/index.html` in a real browser. Test the hero, all six categories, dish navigation, pointer/trackpad/touch interactions, drink glass rotation and liquid fill, resize behavior, and browser console.

## Checks

```bash
npm run check
npm run build
```

`npm run check` validates the scene JavaScript syntax, confirms the CSS matches the preserved reference, and checks that the original scene logic is unchanged after reversing the documented lifecycle wrapper. It does **not** prove that the browser rendering or interactions work. `npm run build` must pass, and manual browser testing must be completed, before this phase can be marked verified.

## Safety

Keep this folder separate from the original project until the migration passes the checks. Do not overwrite the original HTML. Make a Git checkpoint before and after each verified phase.

## Stage 3 — Backend and database foundation

The Stage 3 API and PostgreSQL/Prisma schema now live in `server/`. The current 3D scene intentionally remains unchanged and continues to use its local menu data until the API and database have been run and verified.

See [`STAGE-3.md`](./STAGE-3.md) for setup instructions, the checked-in database migration, seed data, and API routes. The public API is read-only until Stage 4 authentication and authorization are implemented.

Backend static checks and seed/schema tests: `cd server && npm run check`.


## Stage 4 — Owner/staff workspace foundation

The `/dashboard` route adds a separate responsive management interface while preserving the existing public Three.js scene and original scene CSS.

Implemented in this stage:
- Expiring opaque sessions in an `AuthSession` table, HTTP-only cookie, password hashing with Node's scrypt, login throttling, logout, and active-account checks.
- CLI-only initial owner creation (`npm run db:create-owner`) so the first privileged account is not created through an unauthenticated public signup endpoint.
- Owner and staff roles. Both can manage menu items; only the owner can manage staff, business settings, and view audit history.
- Menu create/edit, availability, archive/restore, photo upload (JPG/PNG/WebP/AVIF, max 5 MB), fixed categories, and integer-kobo prices.
- Owner settings for business name, WhatsApp number and public order note; staff activation/deactivation; audit events.
- A responsive overview, visual menu cards, and an item preview overlay.

### Apply the updated schema

If the database was previously created with `prisma db push`, from `server/` run:

```bash
npm install
npx prisma db push
npm run db:generate
npm run db:create-owner
npm run dev
```

The owner setup script prompts for an email, display name, and password of at least 12 characters. Do not commit `server/.env` or upload credentials. In another terminal, from the project root:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/dashboard`. The public menu remains at `http://localhost:5173/`.

For a new database using migrations, run `npm run db:deploy` after installing backend dependencies, then seed with `npm run db:seed`. The schema migration adds persisted authentication sessions. Do not run the prototype seed after manually editing menu records unless you intend to restore the prototype seed values.

### Important boundaries

- The preview overlay currently previews the selected item using the dashboard's menu data; the existing public Three.js scene has deliberately not been rewritten or connected to the API in this stage.
- Image uploads use local disk storage under `server/uploads` for development. Before deployment, configure durable managed object storage and HTTPS.
- Password reset, email invitations, external production image storage, CSRF hardening for a deployed domain, and production deployment configuration remain outstanding.
- This is a development foundation, not yet production-ready. Run `npm run check`, `npm run build`, and browser/manual role-permission tests before acceptance.
