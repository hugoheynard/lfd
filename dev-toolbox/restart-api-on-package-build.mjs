/**
 * Redémarre le backend de dev quand un **paquet du workspace** finit de se
 * reconstruire.
 *
 * ## Le problème qu'il ferme
 *
 * `@lfd/*` expose ses types depuis `src/` et son exécutable depuis `dist/` :
 * le compilateur lit la source, Node lit le build. Le programme tsc du backend
 * inclut donc les sources des paquets — vérifiable avec `tsc --listFiles`.
 *
 * Conséquence, à chaque modification d'un paquet :
 *
 *   1. le tsc de `nest start --watch` voit la SOURCE changer, recompile et
 *      redémarre — avec le `dist` ENCORE ANCIEN ;
 *   2. le `dev:watch` du paquet termine son build un instant plus tard ;
 *   3. plus rien ne redémarre.
 *
 * Le processus sert alors l'ancien contrat indéfiniment. Le symptôme est un
 * `400` sur un corps parfaitement valide — le pire cas, parce qu'il accuse le
 * front alors que le fautif est un processus qui n'a pas rechargé.
 *
 * ## Comment il s'y prend
 *
 * Il ne pilote pas Nest : il **touche** `apps/lfd-api/src/main.ts`. Le tsc de
 * Nest voit une entrée modifiée, réémet, et redémarre — cette fois avec le
 * `dist` neuf. Aucun contenu n'est réécrit (seule la date change), donc rien
 * n'apparaît jamais dans `git status`.
 *
 * Sans dépendance : `fs.watch` suffit, et un process manager de plus dans la
 * boucle de dev serait un process manager de plus à comprendre.
 */
import { watch } from "node:fs";
import { existsSync, readdirSync, utimesSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");
const ENTRY = join(ROOT, "apps", "lfd-api", "src", "main.ts");

/**
 * Le temps qu'un `tsc -b` laisse le `dist` à moitié écrit. Toucher trop tôt
 * ferait redémarrer sur un build incomplet — le défaut qu'on corrige, déplacé.
 */
const SETTLE_MS = 400;

if (!existsSync(ENTRY)) {
  console.error(`✗ point d'entrée introuvable : ${ENTRY}`);
  process.exit(1);
}

const dists = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(PACKAGES, entry.name, "dist"))
  .filter((dist) => existsSync(dist));

if (dists.length === 0) {
  console.error("✗ aucun paquet construit — lancez d'abord `pnpm -r build`.");
  process.exit(1);
}

let pending;
function scheduleRestart(pkg) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    const now = new Date();
    utimesSync(ENTRY, now, now);
    console.log(`↻ ${pkg} reconstruit — backend relancé.`);
  }, SETTLE_MS);
}

for (const dist of dists) {
  const pkg = dist.split("/").at(-2);
  // `recursive` : un paquet émet dans des sous-dossiers, et c'est le dernier
  // fichier écrit qui compte, pas l'index.
  watch(dist, { recursive: true }, (_event, file) => {
    if (typeof file === "string" && file.endsWith(".js")) {
      scheduleRestart(pkg);
    }
  });
}

console.log(`⌁ surveille le build de ${String(dists.length)} paquet(s) → ${ENTRY}`);
