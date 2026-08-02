#!/usr/bin/env node
/**
 * Compagnon des launchers `suite:dev*` : attend que le **shell** réponde, affiche
 * une bannière « prête » et **ouvre le navigateur** — pour ne plus chercher l'URL
 * dans le flux entrelacé de turbo.
 *
 * Lancé en tâche de fond par les scripts `suite:dev*` (`(node … &)`), il sonde
 * puis sort — sur succès (ouvre le navigateur), ou après un délai de garde.
 *
 * `SUITE_URL` surcharge l'URL (défaut le shell). `SUITE_NO_OPEN=1` affiche la
 * bannière sans ouvrir le navigateur.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.env['SUITE_URL'] ?? 'http://localhost:7300';
const DEADLINE_MS = 120_000;
const POLL_MS = 1500;

/** Vrai dès que le shell accepte une requête (peu importe le code). */
async function ready() {
  try {
    await fetch(URL, { redirect: 'manual' });
    return true;
  } catch {
    return false;
  }
}

/** Ouvre l'URL dans le navigateur par défaut (macOS / Linux / Windows). */
function openBrowser() {
  if (process.env['SUITE_NO_OPEN']) {
    return;
  }
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [URL], { stdio: 'ignore', detached: true, shell: true }).unref();
}

const deadline = Date.now() + DEADLINE_MS;
while (Date.now() < deadline) {
  if (await ready()) {
    process.stdout.write(`\n  ✅ Suite prête → ${URL}\n\n`);
    openBrowser();
    process.exit(0);
  }
  await sleep(POLL_MS);
}
process.stdout.write(
  `\n  ⚠️  Shell pas prêt après ${DEADLINE_MS / 1000}s (${URL}) — voir 'pnpm suite:status'.\n\n`,
);
