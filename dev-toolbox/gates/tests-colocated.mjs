#!/usr/bin/env node
/**
 * Gate : **un test du backend vit dans un `__tests__/`, à côté de ce qu'il teste.**
 *
 * La règle est écrite (`CLAUDE.md` §5) et elle a une raison qui n'est pas
 * l'esthétique : un `__tests__/` par dossier rend visible, en ouvrant `src/`,
 * **ce qui est éprouvé et ce qui ne l'est pas**. Un `.spec.ts` posé à côté de sa
 * source se fond dans la liste ; on ne voit plus le trou, on voit juste des
 * fichiers.
 *
 * Trois fichiers y échappaient au 2026-09-03, sur 253 — assez peu pour que
 * personne ne le remarque, assez pour que la règle cesse d'en être une. C'est
 * exactement le régime où une convention meurt : pas violée franchement,
 * seulement plus tout à fait vraie.
 *
 * ## Ce que ce gate NE regarde pas, et pourquoi
 *
 * - **Les frontends.** Leur `CLAUDE.md` prescrit l'inverse, explicitement : « un
 *   spec par NOUVEAU composant (`x.spec.ts` **colocalisé**) », dans le dossier
 *   du composant. C'est la convention Angular, et un dossier par composant y
 *   rend déjà visible ce qui est testé. Cinquante-quatre fichiers y sont
 *   conformes ; les balayer ici casserait une règle au nom d'une autre.
 * - **Les e2e HTTP** (`apps/lfd-api/test/*.e2e-spec.ts`). Ils traversent l'app
 *   entière et n'appartiennent à aucun module — c'est l'exception que §5 nomme.
 *   Ils vivent hors de `src/`, donc hors de portée sans qu'on ait à les exclure.
 *
 * Usage : `pnpm lint:tests-colocated` (branché en CI).
 */
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const ROOT = process.cwd();

/** Les arbres soumis à la règle. Le backend, et lui seul. */
const SCOPES = ["apps/lfd-api/src"];

const SKIP = new Set(["node_modules", "dist", "client", "coverage"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(entry)) {
        yield* walk(path);
      }
    } else if (path.endsWith(".spec.ts")) {
      yield path;
    }
  }
}

const misplaced = [];
let checked = 0;

for (const scope of SCOPES) {
  for (const absolute of walk(join(ROOT, scope))) {
    checked += 1;
    if (basename(dirname(absolute)) !== "__tests__") {
      misplaced.push(relative(ROOT, absolute));
    }
  }
}

if (misplaced.length > 0) {
  console.error("\n❌ Tests hors d'un `__tests__/` :\n");
  for (const path of misplaced.sort()) {
    const home = join(dirname(path), "__tests__", basename(path));
    console.error(`   ${path}\n      → ${home}`);
  }
  console.error("\n   `git mv` suffit — en pensant aux imports relatifs, qui gagnent un `../`.");
  process.exit(1);
}

console.log(`✓ tests-colocated : les ${String(checked)} specs du backend sont dans un __tests__/`);
