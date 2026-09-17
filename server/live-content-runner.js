import { spawn } from 'node:child_process';

const children = [];

function start(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  children.push({ name, child });
  child.on('exit', (code, signal) => {
    console.log(`[${name}] exited code=${code} signal=${signal}`);
  });
  child.on('error', (err) => {
    console.error(`[${name}] process error:`, err.message || err);
  });
  return child;
}

// Preload the catalog bridge only for the existing backend process.
// This keeps the existing server.js logic/UI intact while making published
// catalog reads consistent with the preserved Supabase runtime catalog.
start('unified-backend', ['-r', './server/catalog-supabase-bridge.cjs', 'server.js']);
start('live-content', ['server/live-content-database.js']);

function shutdown(signal) {
  console.log(`[runner] ${signal} received; stopping child processes`);
  for (const { child } of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
