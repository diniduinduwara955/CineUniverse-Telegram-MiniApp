import { spawn } from 'node:child_process';

// Isolated launcher: the existing Cine Universe server runs exactly as before,
// while the Live Content Database runs as a separate Node process.
// This keeps the live updater completely independent from Telegram getUpdates polling.

const children = new Map();
let shuttingDown = false;

function start(name, script) {
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });

  children.set(name, child);
  console.log(`[live-runner] ${name} started (pid=${child.pid})`);

  child.on('exit', (code, signal) => {
    children.delete(name);
    console.log(`[live-runner] ${name} exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);

    if (!shuttingDown && name === 'live-content') {
      setTimeout(() => {
        if (!shuttingDown && !children.has('live-content')) {
          start('live-content', 'server/live-content-database.js');
        }
      }, 3000);
    }
  });

  child.on('error', (error) => {
    console.error(`[live-runner] ${name} failed to start:`, error.message || error);
  });

  return child;
}

start('cine-universe', 'server.js');
start('live-content', 'server/live-content-database.js');

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[live-runner] ${signal} received; stopping isolated processes.`);

  for (const child of children.values()) {
    try { child.kill('SIGTERM'); } catch {}
  }

  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
