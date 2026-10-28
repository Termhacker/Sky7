import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const seed = await readFile(new URL('../prisma/seed.js', import.meta.url), 'utf8');

test('seed uses integer kobo prices and does not store formatted currency strings', () => {
  assert.match(seed, /priceKobo/);
  assert.match(seed, /450000/);
  assert.doesNotMatch(seed, /price:\s*['"]₦/);
});

test('seed preserves all six fixed categories and all 24 prototype items', () => {
  for (const id of ['mains', 'starters', 'grills', 'sides', 'drinks', 'desserts']) {
    assert.match(seed, new RegExp(`'${id}'`));
  }
  assert.match(seed, /Seeded \$\{categories\.length\} fixed categories and \$\{items\.length\} menu items/);
  assert.equal((seed.match(/^  \['(?:mains|starters|grills|sides|drinks|desserts)'/gm) ?? []).length, 24);
});

test('unavailable items are seeded rather than omitted', () => {
  assert.match(seed, /Fisherman Okra[^\n]*720000,false/);
  assert.match(seed, /Lamb Chops[^\n]*1100000,false/);
  assert.match(seed, /Ginger Beer[^\n]*180000,false/);
});

test('database schema has fixed categories, safe integer currency, staff roles and audit log models', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /priceKobo\s+Int/);
  assert.match(schema, /enum UserRole[\s\S]*OWNER[\s\S]*STAFF/);
  assert.match(schema, /model BusinessSettings/);
  assert.match(schema, /model AuditLog/);
  assert.match(schema, /archivedAt\s+DateTime\?/);
});

test('checked-in migration creates the price constraint and category foreign key', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20261015200000_init/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /CHECK \("priceKobo" >= 0\)/);
  assert.match(migration, /MenuItem_categoryId_fkey/);
  assert.match(migration, /AuditLog_actorId_fkey/);
});


test('schema includes persisted expiring authentication sessions', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /model AuthSession/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.match(schema, /expiresAt\s+DateTime/);
  assert.match(schema, /onDelete: Cascade/);
});

test('admin API protects mutations and separates owner-only capabilities', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const route of [
    "app.post('/api/auth/login'",
    "app.get('/api/auth/me', requireAuth",
    "app.post('/api/admin/menu', requireAuth",
    "app.patch('/api/admin/menu/:id', requireAuth",
    "app.get('/api/admin/settings', requireAuth, requireOwner",
    "app.post('/api/admin/staff', requireAuth, requireOwner",
    "app.get('/api/admin/audit', requireAuth, requireOwner",
  ]) assert.ok(app.includes(route), `Expected protected route: ${route}`);
});

test('owner setup script never prints or stores a plaintext password', async () => {
  const script = await readFile(new URL('../prisma/create-owner.js', import.meta.url), 'utf8');
  assert.match(script, /scrypt/);
  assert.match(script, /passwordHash/);
  assert.match(script, /password\.length < 12/);
  assert.doesNotMatch(script, /password:\s*password/);
});
