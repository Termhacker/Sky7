import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);
const rl = createInterface({ input: stdin, output: stdout });

try {
  const email = (
    await rl.question('Existing owner email: ')
  ).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || user.role !== 'OWNER') {
    throw new Error('No owner account found with that email.');
  }

  if (!user.isActive) {
    throw new Error('This owner account is inactive. No changes made.');
  }

  const password = await rl.question(
    'New password (minimum 12 characters): '
  );

  if (password.length < 12 || password.length > 200) {
    throw new Error('Password must be 12–200 characters.');
  }

  const confirmation = await rl.question('Confirm new password: ');

  if (password !== confirmation) {
    throw new Error('Passwords do not match. No changes made.');
  }

  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  const passwordHash =
    `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(`Password reset successfully for ${user.email}.`);
  console.log('Your existing account and role have been preserved.');
} catch (error) {
  console.error(`Password reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
