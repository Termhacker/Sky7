import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const rl = createInterface({ input: stdin, output: stdout });
async function askPasswordHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const fallback = createInterface({ input: stdin, output: stdout });
    try { return await fallback.question(`${prompt} (input may be visible in this terminal): `); }
    finally { fallback.close(); }
  }
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    let value = '';
    const finish = (error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) return finish(new Error('Password entry cancelled.'));
        if (byte === 13 || byte === 10) return finish();
        if (byte === 8 || byte === 127) value = value.slice(0, -1);
        else if (byte >= 32 && byte <= 126 && value.length < 200) value += String.fromCharCode(byte);
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
try {
  const existing = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true } });
  if (existing) {
    console.error(`An active owner already exists (${existing.email}). Sign in from /dashboard instead.`);
    process.exitCode = 1;
  } else {
    const email = (await rl.question('Owner email: ')).trim().toLowerCase();
    const displayName = (await rl.question('Owner display name: ')).trim();
    rl.close();
    const password = await askPasswordHidden('Owner password (minimum 12 characters): ');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (!displayName || displayName.length > 100) throw new Error('Display name must be 1–100 characters.');
    if (password.length < 12 || password.length > 200) throw new Error('Password must be 12–200 characters.');
    if (await prisma.user.findUnique({ where: { email } })) throw new Error('That email is already in use.');
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, 64);
    const passwordHash = `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
    const user = await prisma.user.create({ data: { email, displayName, passwordHash, role: 'OWNER' } });
    await prisma.businessSettings.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main', businessName: 'SKY7', currency: 'NGN' },
    });
    await prisma.auditLog.create({ data: { actorId: user.id, action: 'OWNER_SETUP', entityType: 'User', entityId: user.id, summary: 'Initial owner account created' } });
    console.log(`Owner account created for ${email}. Open http://localhost:5173/dashboard to sign in.`);
  }
} catch (error) {
  console.error(`Owner setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
