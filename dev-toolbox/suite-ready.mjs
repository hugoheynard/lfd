#!/usr/bin/env node
/**
 * Compagnon des launchers `suite:dev*` : attend que le **shell** réponde et
 * affiche une bannière « prête » avec l'URL (cliquable dans le terminal) — pour ne
 * plus la chercher dans le flux entrelacé de turbo.
 *
 * Lancé en tâche de fond par les scripts `suite:dev*` (`(node … &)`), il sonde
 * puis sort — sur succès (bannière), ou après un délai de garde.
 *
 * **N'ouvre PAS de navigateur par défaut** : chaque relance du script en ouvrait
 * une nouvelle (spam de fenêtres). Ouverture **opt-in** via `SUITE_OPEN=1`.
 * `SUITE_URL` surcharge l'URL (défaut le shell).
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

/** Ouvre l'URL dans le navigateur par défaut — **opt-in** (`SUITE_OPEN=1`) pour
 *  éviter d'ouvrir une fenêtre à chaque relance du launcher. */
function openBrowser() {
  if (!process.env['SUITE_OPEN']) {
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
