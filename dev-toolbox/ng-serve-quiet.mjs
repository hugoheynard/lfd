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
 * Une ligne appartient à la table des chunks si :
 * - c'est un en-tête de section (`Initial/Lazy chunk files`), OU
 * - c'est une ligne de colonnes d'en-tête / total (`| Names`, `| Raw size`, …), OU
 * - elle se termine par une taille (`… 26.73 kB |` / `938 bytes`).
 * Les warnings de budget se terminent par `kB.` (point) et ne matchent donc pas.
 */
const CHUNK_TABLE_LINE =
  /^(Initial|Lazy) chunk files\b|\|\s*(Names|Raw size|Estimated transfer size|Initial total)\b|(kB|bytes)\s*\|?\s*$/;

const child = spawn(`ng serve ${process.argv.slice(2).join(' ')}`, {
  stdio: ['inherit', 'pipe', 'inherit'],
  shell: true,
  env: process.env,
});

createInterface({ input: child.stdout }).on('line', (line) => {
  if (!CHUNK_TABLE_LINE.test(line)) {
    process.stdout.write(`${line}\n`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
