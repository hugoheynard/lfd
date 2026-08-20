#!/usr/bin/env node
/**
 * Doctor de la suite : ping chaque port dev et affiche ce qui tourne.
 *
 * Lit la carte des ports depuis la source de vérité UNIQUE `@lfd/endpoints`
 * (`DEV_PORTS`) — aucun numéro n'est réécrit ici. Un simple TCP connect suffit
 * à savoir « ça écoute ou pas », sans dépendre du protocole (HTTP, WS…).
 *
 * Usage : `pnpm suite:status`
 */
import net from 'node:net';
import { DEV_PORTS } from '@lfd/endpoints';

/** Les services à sonder (on ignore `spareFront`, port de secours non lancé). */
const SERVICES = [
  { label: 'B2B front', port: DEV_PORTS.b2bFront },
  { label: 'B2B admin front', port: DEV_PORTS.b2bAdminFront },
  { label: 'B2B back', port: DEV_PORTS.b2bBack },
];

const CONNECT_TIMEOUT_MS = 400;

/** Vrai si un serveur écoute sur `localhost:port`. */
function isUp(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (up) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

const results = await Promise.all(
  SERVICES.map(async (svc) => ({ ...svc, up: await isUp(svc.port) })),
);

const width = Math.max(...SERVICES.map((s) => s.label.length));
process.stdout.write('\nSuite LFC — état des serveurs dev\n\n');
for (const { label, port, up } of results) {
  const mark = up ? '✅ up  ' : '❌ down';
  process.stdout.write(`  ${mark}  ${label.padEnd(width)}  http://localhost:${port}\n`);
}
process.stdout.write('\n');
