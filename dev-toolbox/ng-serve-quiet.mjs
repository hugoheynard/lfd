#!/usr/bin/env node
/**
 * Wrapper `ng serve` qui masque **la table des chunks** — réimprimée en entier à
 * CHAQUE rebuild en watch (bruit, surtout multiplié par le nombre de fronts).
 *
 * Ne masque QUE les lignes de la table (en-têtes, lignes de taille, total). Garde
 * tout le reste : erreurs, warnings (budgets), « Rebuilding… », « bundle
 * generation complete [Xms] », « Local: … ». Transparent sur le code de sortie et
 * les signaux → un crash de ng serve reste un échec (fail fast).
 *
 * Utilisé par le script `dev` de chaque front. Les args sont transmis tels quels
 * (`--port`, `--host`, …).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Bruit à masquer :
 * - la **table des chunks** : en-tête de section (`Initial/Lazy chunk files`),
 *   ligne de colonnes / total (`| Names`, `| Raw size`, …), ligne de taille
 *   (`… 26.73 kB |` / `938 bytes`). Les warnings de budget finissent par `kB.`
 *   (point) et ne matchent donc pas — ils passent ;
 * - le hint `press h + enter to show help` (inutile sous turbo : l'input va à
 *   turbo, pas au front) ;
 * - la `NOTE: Raw file sizes…` et les labels `Browser/Server bundles`.
 */
const NOISE_LINE =
  /^(Initial|Lazy) chunk files\b|\|\s*(Names|Raw size|Estimated transfer size|Initial total)\b|(kB|bytes)\s*\|?\s*$|press .+ to show help|Raw file sizes do not reflect|^(Browser|Server) bundles\s*$/;

const child = spawn(`ng serve ${process.argv.slice(2).join(' ')}`, {
  stdio: ['inherit', 'pipe', 'inherit'],
  shell: true,
  env: process.env,
});

// Collapse aussi les lignes vides consécutives (la table filtrée en laisse).
let lastBlank = false;
createInterface({ input: child.stdout }).on('line', (line) => {
  if (NOISE_LINE.test(line)) {
    return;
  }
  const blank = line.trim() === '';
  if (blank && lastBlank) {
    return;
  }
  lastBlank = blank;
  process.stdout.write(`${line}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
