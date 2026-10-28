import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'sky7_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const uploadDir = fileURLToPath(new URL('../uploads/', import.meta.url));
fs.mkdirSync(uploadDir, { recursive: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN: z.string().url().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});
const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1200),
  priceKobo: z.number().int().min(0).max(2_000_000_000),
  categoryId: z.string().min(1).max(40),
  available: z.boolean().default(true),
  badge: z.string().trim().max(80).nullable().optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  imageAlt: z.string().trim().max(240).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(100),
  whatsappNumber: z.string().trim().max(30).nullable(),
  publicOrderNote: z.string().trim().max(500).nullable(),
});
const staffSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200),
});

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const cookieOptions = (production) => ({
  httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge: SESSION_MS,
});
function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return null;
}
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  try {
    const [scheme, saltHex, keyHex] = encoded.split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110) || 'menu-item';
}
function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}
async function audit(prisma, actorId, action, entityType, entityId, summary, metadata = undefined) {
  await prisma.auditLog.create({
    data: { actorId, action, entityType, entityId: entityId ?? null, summary, ...(metadata ? { metadata } : {}) },
  });
}

export function createApp({ prisma, env = process.env } = {}) {
  if (!prisma) throw new Error('createApp requires a Prisma client instance');
  const config = envSchema.parse(env);
  const app = express();
  const production = config.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const origins = (env.FRONTEND_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/uploads', express.static(uploadDir, { maxAge: production ? '1d' : 0, immutable: false, fallthrough: false }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'LOGIN_RATE_LIMIT', message: 'Too many login attempts. Please try again later.' } } });

  async function requireAuth(req, res, next) {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token || token.length > 200) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
      const session = await prisma.authSession.findUnique({
        where: { tokenHash: hashToken(token) }, include: { user: true },
      });
      if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
        if (session) await prisma.authSession.deleteMany({ where: { id: session.id } });
        res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' });
        return res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' } });
      }
      req.user = session.user;
      req.sessionId = session.id;
      return next();
    } catch (error) { return next(error); }
  }
  const requireOwner = (req, res, next) => {
    if (req.user?.role !== 'OWNER') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner access is required for this action.' } });
    return next();
  };

  app.get('/api/health', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', database: 'connected' }); }
    catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
  });

  app.get('/api/auth/status', async (_req, res, next) => {
    try {
      const ownerExists = await prisma.user.count({ where: { role: 'OWNER', isActive: true } });
      res.json({ data: { ownerSetupRequired: ownerExists === 0 } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a valid email and password.' } });
      const email = parsed.data.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      const valid = user && user.isActive && await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_MS);
      await prisma.authSession.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } });
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit(prisma, user.id, 'LOGIN', 'User', user.id, `${user.role} signed in`);
      res.cookie(SESSION_COOKIE, token, cookieOptions(production));
      res.json({ data: { user: publicUser(user), expiresAt } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
      res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: production, path: '/' });
      res.json({ data: { signedOut: true } });
    } catch (error) { next(error); }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ data: { user: publicUser(req.user) } }));

  app.get('/api/categories', async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true } });
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json({ data: categories });
    } catch (error) { next(error); }
  });

  app.get('/api/menu', async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sortOrder: true, items: {
          where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true, description: true, priceKobo: true, imageUrl: true, imageAlt: true,
            available: true, badge: true, sortOrder: true, updatedAt: true },
        }},
      });
      res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      res.json({ data: categories });
    } catch (error) { next(error); }
  });

  app.get('/api/settings/public', async (_req, res, next) => {
    try {
      const settings = await prisma.businessSettings.findUnique({ where: { id: 'main' } });
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json({ data: settings ? {
        businessName: settings.businessName, currency: settings.currency,
        whatsappNumber: settings.whatsappNumber, publicOrderNote: settings.publicOrderNote,
      } : { businessName: 'SKY7', currency: 'NGN', whatsappNumber: null, publicOrderNote: null } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/menu', requireAuth, async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: {
        id: true, name: true, sortOrder: true, items: { orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] },
      }});
      res.json({ data: categories });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/menu', requireAuth, async (req, res, next) => {
    try {
      const parsed = itemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Check the menu item fields.', details: parsed.error.flatten() } });
      if (!await prisma.category.findUnique({ where: { id: parsed.data.categoryId } })) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Choose one of the existing categories.' } });
      const baseSlug = slugify(parsed.data.name);
      let slug = `${parsed.data.categoryId}-${baseSlug}`;
      if (await prisma.menuItem.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(3).toString('hex')}`;
      const item = await prisma.menuItem.create({ data: { ...parsed.data, slug } });
      await audit(prisma, req.user.id, 'CREATE', 'MenuItem', item.id, `Created ${item.name}`);
      res.status(201).json({ data: item });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/menu/:id', requireAuth, async (req, res, next) => {
    try {
      const patchSchema = itemSchema.partial().strict();
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success || Object.keys(req.body ?? {}).length === 0) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Provide valid menu fields to update.' } });
      if (parsed.data.categoryId && !await prisma.category.findUnique({ where: { id: parsed.data.categoryId } })) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Choose one of the existing categories.' } });
      const before = await prisma.menuItem.findUnique({ where: { id: req.params.id } });
      if (!before) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Menu item not found.' } });
      const data = { ...parsed.data };
      if (data.name && data.name !== before.name) {
        const candidate = `${data.categoryId ?? before.categoryId}-${slugify(data.name)}`;
        const collision = await prisma.menuItem.findFirst({ where: { slug: candidate, NOT: { id: before.id } } });
        if (!collision) data.slug = candidate;
      }
      const item = await prisma.menuItem.update({ where: { id: before.id }, data });
      await audit(prisma, req.user.id, 'UPDATE', 'MenuItem', item.id, `Updated ${item.name}`, { fields: Object.keys(data) });
      res.json({ data: item });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/menu/:id/archive', requireAuth, async (req, res, next) => {
    try {
      const item = await prisma.menuItem.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } });
      await audit(prisma, req.user.id, 'ARCHIVE', 'MenuItem', item.id, `Archived ${item.name}`);
      res.json({ data: item });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/menu/:id/restore', requireAuth, async (req, res, next) => {
    try {
      const item = await prisma.menuItem.update({ where: { id: req.params.id }, data: { archivedAt: null } });
      await audit(prisma, req.user.id, 'RESTORE', 'MenuItem', item.id, `Restored ${item.name}`);
      res.json({ data: item });
    } catch (error) { next(error); }
  });

  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
      const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' })[file.mimetype];
      callback(null, `${randomBytes(16).toString('hex')}${ext ?? ''}`);
    },
  });
  const upload = multer({
    storage, limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)) return callback(new Error('INVALID_IMAGE_TYPE'));
      callback(null, true);
    },
  });
  app.post('/api/admin/uploads', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (error) => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'IMAGE_TOO_LARGE', message: 'Choose an image smaller than 5 MB.' } });
        if (error.message === 'INVALID_IMAGE_TYPE') return res.status(400).json({ error: { code: 'INVALID_IMAGE_TYPE', message: 'Use a JPG, PNG, WebP or AVIF image.' } });
        return next(error);
      }
      if (!req.file) return res.status(400).json({ error: { code: 'IMAGE_REQUIRED', message: 'Choose an image to upload.' } });
      return res.status(201).json({ data: { imageUrl: `/uploads/${req.file.filename}`, fileName: req.file.filename, size: req.file.size } });
    });
  });

  app.get('/api/admin/settings', requireAuth, requireOwner, async (_req, res, next) => {
    try {
      const settings = await prisma.businessSettings.findUnique({ where: { id: 'main' } });
      res.json({ data: settings ?? { id: 'main', businessName: 'SKY7', currency: 'NGN', whatsappNumber: null, publicOrderNote: null } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/settings', requireAuth, requireOwner, async (req, res, next) => {
    try {
      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Check the business settings.' } });
      const number = parsed.data.whatsappNumber?.replace(/[\s()+-]/g, '') ?? null;
      if (number && !/^\d{8,15}$/.test(number)) return res.status(400).json({ error: { code: 'INVALID_WHATSAPP', message: 'Enter the WhatsApp number with country code, using digits only or common separators.' } });
      const settings = await prisma.businessSettings.upsert({
        where: { id: 'main' }, update: { ...parsed.data, whatsappNumber: number },
        create: { id: 'main', ...parsed.data, whatsappNumber: number },
      });
      await audit(prisma, req.user.id, 'UPDATE', 'BusinessSettings', 'main', 'Updated business settings');
      res.json({ data: settings });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/staff', requireAuth, requireOwner, async (_req, res, next) => {
    try {
      const staff = await prisma.user.findMany({ where: { role: 'STAFF' }, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, displayName: true, isActive: true, lastLoginAt: true, createdAt: true } });
      res.json({ data: staff });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/staff', requireAuth, requireOwner, async (req, res, next) => {
    try {
      const parsed = staffSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Use a valid email, name and password of at least 12 characters.' } });
      const email = parsed.data.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account already uses that email.' } });
      const user = await prisma.user.create({ data: { email, displayName: parsed.data.displayName, passwordHash: await hashPassword(parsed.data.password), role: 'STAFF' } });
      await audit(prisma, req.user.id, 'CREATE', 'User', user.id, `Created staff account ${email}`);
      res.status(201).json({ data: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, isActive: user.isActive } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/staff/:id', requireAuth, requireOwner, async (req, res, next) => {
    try {
      const parsed = z.object({ isActive: z.boolean() }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Provide isActive as true or false.' } });
      const user = await prisma.user.findFirst({ where: { id: req.params.id, role: 'STAFF' } });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Staff account not found.' } });
      const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: parsed.data.isActive } });
      if (!updated.isActive) await prisma.authSession.deleteMany({ where: { userId: updated.id } });
      await audit(prisma, req.user.id, parsed.data.isActive ? 'ACTIVATE' : 'DEACTIVATE', 'User', user.id, `${parsed.data.isActive ? 'Activated' : 'Deactivated'} staff account ${user.email}`);
      res.json({ data: { id: updated.id, email: updated.email, displayName: updated.displayName, role: updated.role, isActive: updated.isActive } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/audit', requireAuth, requireOwner, async (_req, res, next) => {
    try {
      const events = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100,
        include: { actor: { select: { email: true, displayName: true, role: true } } } });
      res.json({ data: events });
    } catch (error) { next(error); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }));
  app.use((error, _req, res, _next) => {
    if (!production) console.error(error);
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    if (error?.message === 'Origin is not allowed by CORS') return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not allowed.' } });
    if (error?.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested record was not found.' } });
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  });
  return app;
}
