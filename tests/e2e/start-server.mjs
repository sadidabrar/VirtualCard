import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { execFileSync, spawn } from 'child_process';

const e2eDir = path.join(process.cwd(), 'data', 'e2e');
fs.rmSync(e2eDir, { recursive: true, force: true });
fs.mkdirSync(path.join(e2eDir, 'db'), { recursive: true });
fs.mkdirSync(path.join(e2eDir, 'uploads'), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3199',
  BASE_DOMAIN: 'virtualcard.duckdns.org',
  DATABASE_URL: path.join(e2eDir, 'db', 'e2e.db'),
  UPLOAD_DIR: path.join(e2eDir, 'uploads'),
  SESSION_SECRET: 'e2e_test_session_secret_minimum_64_characters_long_for_verification',
  MASTER_USERNAME: 'master',
  MASTER_EMAIL: 'master@virtualcard.duckdns.org',
  MASTER_PASSWORD: 'MasterE2EPass2026!',
  LOG_LEVEL: 'warn',
};

execFileSync(process.execPath, ['dist/db/migrate.js'], { env, stdio: 'inherit' });
execFileSync(process.execPath, ['dist/db/seed.js'], { env, stdio: 'inherit' });

const child = spawn(process.execPath, ['dist/server.js'], { env, stdio: 'inherit' });

function shutdown(signal) {
  child.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
