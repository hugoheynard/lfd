#!/usr/bin/env node
/**
 * Gate : **une app conteneurisée ne déclare pas de champ `files`.**
 *
 * L'image de production est fabriquée par `pnpm --filter <app> deploy --legacy
 * --prod /app` (cf. `apps/lfd-api/Dockerfile`). Ce que `deploy` emporte dans le
 * dossier autonome est décidé par le `files` du manifeste : absent, il copie
 * tout le dossier de l'app ; présent, il ne copie QUE ce qu'il énumère.
 *
 * Or ces apps embarquent des fichiers que personne ne penserait à lister :
 * les clients Prisma sont générés DANS `src/` (`src/platform/database/client`,
 * `src/pim/infra/database/client`) puis émis dans `dist/` par tsc. Un `files`
 * ajouté pour « faire propre » — le réflexe naturel sur un paquet publié —
 * amputerait l'image sans que rien ne devienne rouge : le build passe, l'image
 * se construit, et le container meurt au DÉMARRAGE sur un module introuvable.
 *
 * C'est la pire forme de panne qu'on puisse s'infliger ici : elle ne se
 * manifeste qu'en production, sur du code que la CI a déclaré bon.
 *
 * Ce que le gate NE fait pas : interdire `files` aux packages de `packages/`.
 * Eux sont consommés par résolution de workspace, pas par `pnpm deploy` — le
 * champ y est légitime.
 *
 * Usage : `pnpm lint:deployed-app-files` (branché en CI).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * Les apps dont on construit une image. Liste **explicite**, pas un glob sur
 * `apps/*` : une app front n'a pas ce problème, et une app ajoutée demain doit
 * être inscrite ici par quelqu'un qui a lu pourquoi.
 */
const CONTAINERIZED = [{ name: "lfd-api", manifest: "apps/lfd-api/package.json" }];

const offenders = [];
for (const app of CONTAINERIZED) {
  const path = join(ROOT, app.manifest);
  if (!existsSync(path)) {
    console.error(`❌ Manifeste introuvable : ${app.manifest} (app renommée ou supprimée ?)`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.files !== undefined) {
    offenders.push(app);
  }
}

if (offenders.length === 0) {
  console.log("✅ Aucune app conteneurisée ne restreint ce que `pnpm deploy` emporte.");
  process.exit(0);
}

console.error("❌ Champ `files` sur une app conteneurisée :\n");
for (const app of offenders) {
  console.error(`  ${app.manifest}`);
}
console.error(
  "\n`pnpm deploy` ne copierait alors QUE les entrées listées. Les clients Prisma" +
    "\ngénérés dans `src/` et émis dans `dist/` en sortiraient, et le container" +
    "\nmourrait au démarrage — sans qu'aucune étape de build ne devienne rouge." +
    "\nRetirer le champ ; le `.dockerignore` est le bon endroit pour alléger l'image.",
);
process.exit(1);
