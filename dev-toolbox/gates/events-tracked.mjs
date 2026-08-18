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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'client', 'coverage', 'out-tsc', '.turbo', '.angular']);

/** Fichiers qui DÉFINISSENT le mécanisme, ou qui ne font que le citer. */
const ALLOWED = new Set([
  'apps/lfd-api/src/infra/events/background-work.ts',
  'apps/lfd-api/src/infra/events/events.module.ts',
  'apps/lfd-api/src/infra/events/domain-event-publisher.ts',
  'apps/lfd-api/src/infra/events/cqrs-domain-event-publisher.ts',
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
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
    const source = readFileSync(file, 'utf8');
    // Un module qui se contente d'ENREGISTRER des abonnés n'en est pas un.
    if (!source.includes('@EventsHandler(') || !source.includes('implements IEventHandler')) {
      continue;
    }
    if (!source.includes('this.work.track(')) {
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
