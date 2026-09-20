#!/usr/bin/env node
/**
 * Pose les icônes natives dans le catalogue d'assets iOS.
 *
 * Pourquoi pas `@capacitor/assets` : il embarque `sharp@0.32.6`, dont le binaire
 * natif n'existe plus en prébuild pour cette plateforme et refuse de se
 * compiler. L'outil échoue à la première image sur une trace qui parle de
 * plateformes, jamais de la vraie cause.
 *
 * Et il se trouve qu'on n'a besoin d'aucun redimensionnement : le catalogue iOS
 * moderne ne demande qu'UNE icône (1024²) et un écran de lancement (2732²), or
 * `resources/` les porte déjà à ces tailles exactes. Ce script ne fait donc que
 * VÉRIFIER les dimensions puis copier — pas de dépendance, pas de binaire natif,
 * et un échec qui dit ce qui ne va pas.
 *
 * Le jour où Android arrive, c'est ici qu'on ajoutera ses densités — et il
 * faudra alors un redimensionneur.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const resources = join(app, 'resources');
const xcassets = join(app, 'ios/App/App/Assets.xcassets');

/** Lit la taille dans l'en-tête IHDR — les 24 premiers octets suffisent. */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  if (head.toString('latin1', 1, 4) !== 'PNG') {
    throw new Error(`${file} n'est pas un PNG.`);
  }
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/** Copie `source` vers chaque destination, après contrôle de sa taille. */
function place(source, expected, targets) {
  const from = join(resources, source);
  if (!existsSync(from)) {
    throw new Error(`Source manquante : resources/${source} (cf. resources/README.md).`);
  }
  const { width, height } = pngSize(from);
  if (width !== expected || height !== expected) {
    throw new Error(`resources/${source} fait ${width}×${height}, attendu ${expected}².`);
  }
  for (const target of targets) {
    const to = join(xcassets, target);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    console.log(`  ${target} ← resources/${source}`);
  }
}

if (!existsSync(xcassets)) {
  console.error("Le projet iOS n'existe pas encore. Lancer `pnpm ios:add` d'abord.");
  process.exit(1);
}

console.log('Assets natifs iOS :');
place('icon.png', 1024, ['AppIcon.appiconset/AppIcon-512@2x.png']);
// Les trois échelles pointent sur la même image : elle est déjà à la taille de
// la plus grande, et iOS n'a rien à interpoler.
place('splash.png', 2732, [
  'Splash.imageset/splash-2732x2732.png',
  'Splash.imageset/splash-2732x2732-1.png',
  'Splash.imageset/splash-2732x2732-2.png',
]);
