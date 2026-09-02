import { startV83Reliability } from './v83-reliability-layer.mjs';

const bootstrap = await startV83Reliability();
console.log('[v83] Reliability layer active:', bootstrap.snapshot.counts);
await import('./server.js');
