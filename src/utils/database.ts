import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { env } from '../config';

const DATABASE_URL_PREFIX = 'file:';

function getDatabasePath(): string | null {
  if (!env.databaseUrl.startsWith(DATABASE_URL_PREFIX)) {
    return null;
  }

  const relativePath = env.databaseUrl.slice(DATABASE_URL_PREFIX.length);
  return resolve(process.cwd(), relativePath);
}

export async function ensureDatabase() {
  const dbPath = getDatabasePath();

  if (!dbPath) {
    // Non-file databases (e.g., Postgres) are handled externally
    return;
  }

  if (existsSync(dbPath)) {
    return;
  }

  mkdirSync(dirname(dbPath), { recursive: true });

  console.log(`🆕 Database not found at ${dbPath}. Running Prisma db push...`);

  const proc = Bun.spawn({
    cmd: ['npx', 'prisma', 'db', 'push'],
    stdout: 'inherit',
    stderr: 'inherit',
    cwd: process.cwd(),
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error('Failed to create database via prisma db push');
  }

  console.log('✅ Database created successfully.');
}
