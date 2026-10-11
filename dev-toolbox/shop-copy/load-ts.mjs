/**
 * Charge les dictionnaires TypeScript de la boutique **sans compilation** :
 * Node 22 efface les types tout seul (`module-typescript`), il ne lui manque
 * que la résolution qu'Angular fait d'habitude.
 *
 * - un import relatif sans extension (`./fr`) ou en `.js` vise le `.ts` voisin ;
 * - `@lfd/contracts` vise ses SOURCES, pas son `dist/` : la porte doit tourner
 *   sur un clone où aucun paquet n'est construit ;
 * - `@lfd/b2b-ui/company` vise le seul fichier de libellés que les
 *   dictionnaires lisent (vérifié le 2026-10-11 : `delivery-procedure.fr.ts`,
 *   seul importeur de valeur) — son `index.ts` tire des composants Angular,
 *   que l'effacement de types ne sait pas charger. Un import de valeur neuf
 *   depuis un autre sous-chemin échouera bruyamment, jamais en silence.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const ALIASES = {
  "@lfd/contracts": join(ROOT, "packages/contracts/src/index.ts"),
  "@lfd/b2b-ui/company": join(
    ROOT,
    "packages/b2b-ui/src/company/delivery-procedure/delivery-procedure.labels.ts",
  ),
};

let registered = false;

function resolveTs(specifier, parentURL) {
  const bare = specifier.replace(/\.js$/, "");
  for (const candidate of [`${bare}.ts`, `${bare}/index.ts`]) {
    const path = fileURLToPath(new URL(candidate, parentURL));
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  return null;
}

function register() {
  if (registered) return;
  registered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier in ALIASES) {
        return { url: pathToFileURL(ALIASES[specifier]).href, shortCircuit: true };
      }
      if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
        const url = resolveTs(specifier, context.parentURL);
        if (url) return { url, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.endsWith(".ts")) return nextLoad(url, { ...context, format: "module-typescript" });
      return nextLoad(url, context);
    },
  });
}

/** Importe un module TypeScript du dépôt, chemin relatif à la racine. */
export async function importTs(relativePath) {
  register();
  return import(pathToFileURL(join(ROOT, relativePath)).href);
}

export { ROOT };
