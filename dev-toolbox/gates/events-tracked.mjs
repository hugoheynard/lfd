#!/usr/bin/env node
/**
 * Gate : un abonné d'événement (`@EventsHandler`) **s'inscrit au travail de fond**.
 *
 * Pourquoi un gate plutôt qu'une convention : un abonné tourne hors de la
 * requête HTTP, et personne n'attend sa fin. S'il ne s'inscrit pas auprès de
 * `BackgroundWork`, deux choses cassent en silence —
 *
 * 1. `drain()` (e2e) rend la main avant que l'abonné ait écrit : le test lit une
 *    table encore vide, ou vide la base pendant qu'une écriture arrive, et
 *    l'échec accuse le test SUIVANT. C'est le pire genre de rouge : intermittent
 *    et qui désigne le mauvais coupable.
 * 2. son échec devient un `unhandledRejection` — un log illisible, ou pire.
 *
 * Le manquement ne se voit ni au typecheck, ni au lint, ni sur un test vert :
 * il ne se voit qu'un jour de malchance, en CI, sur un test qui n'a rien à voir.
 * D'où ce filet.
 *
 * Usage : `pnpm lint:events-tracked` (branché en CI).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "client",
  "coverage",
  "out-tsc",
  ".turbo",
  ".angular",
]);

/**
 * Fichiers qui DÉFINISSENT le mécanisme, ou qui ne font que le citer.
 *
 * 🔴 Ces quatre chemins ont pointé pendant des mois vers `src/infra/events/`,
 * un dossier qui **n'existe plus** — le mécanisme a déménagé sous
 * `src/platform/`. La liste ne protégeait donc plus rien, et rien ne l'a dit :
 * la porte restait verte, parce que sa détection exige `@EventsHandler(` ET
 * `implements IEventHandler`, et que ces quatre-là ne citent le décorateur
 * qu'en prose. Une exception morte est silencieuse par construction — elle ne
 * se manifeste que le jour où l'on en aurait eu besoin.
 *
 * D'où la vérification ci-dessous : un chemin inscrit ici doit EXISTER.
 */
const ALLOWED = new Set([
  "apps/lfd-api/src/platform/events/background-work.ts",
  "apps/lfd-api/src/platform/events/events.module.ts",
  "apps/lfd-api/src/platform/events/domain-event-publisher.ts",
  "apps/lfd-api/src/platform/events/cqrs-domain-event-publisher.ts",
]);

/**
 * Une allowlist qui nomme un fichier disparu est une allowlist qui ment. On la
 * relit à chaque exécution plutôt que de la croire : c'est le seul moyen qu'un
 * déménagement de dossier se voie ici et pas trois mois plus tard.
 */
const missing = [...ALLOWED].filter((path) => !existsSync(join(ROOT, path)));
if (missing.length > 0) {
  console.error("Allowlist périmée : ces chemins exemptés n'existent pas.\n");
  for (const path of missing) {
    console.error(`  ${path}`);
  }
  console.error(
    "\nUne exemption qui ne désigne rien ne protège rien, et se tait. La repointer,\n" +
      "ou la retirer si le fichier a disparu pour de bon.\n",
  );
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      yield full;
    }
  }
}

const offenders = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const path = relative(ROOT, file);
    if (ALLOWED.has(path)) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    // Un module qui se contente d'ENREGISTRER des abonnés n'en est pas un.
    if (!source.includes("@EventsHandler(") || !source.includes("implements IEventHandler")) {
      continue;
    }
    if (!source.includes("this.work.track(")) {
      offenders.push(path);
    }
  }
}

if (offenders.length > 0) {
  console.error("Abonnés d'événement non suivis (BackgroundWork.track) :\n");
  for (const path of offenders) {
    console.error(`  ${path}`);
  }
  console.error(
    "\nUn abonné tourne hors de la requête : sans `this.work.track(...)`, personne\n" +
      "ne sait quand il a fini, et son échec n'a personne pour l'attraper.\n" +
      'Patron : `handle(e): void { void this.work.track(this.run(e), "<label>"); }`\n',
  );
  process.exit(1);
}

console.log("Gate OK : tous les abonnés d'événement s'inscrivent au travail de fond.");
