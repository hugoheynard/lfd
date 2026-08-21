#!/usr/bin/env node
/**
 * Gate : **un lien absolu mène quelque part.**
 *
 * Un `routerLink="/quelque-chose"` qui ne correspond à aucune route ne casse
 * rien à la compilation, rien au démarrage, rien aux tests : il casse au clic,
 * en `NG04002`, devant l'utilisateur. Le PIM en portait CINQ — survivants de sa
 * fusion dans le back-office, où ses routes sont passées de `/produits` à
 * `/pim/produits`. Personne ne les a vus pendant des mois.
 *
 * Ce qu'il vérifie, et rien d'autre : tout `routerLink` **littéral et absolu**
 * d'un gabarit correspond à une route déclarée. Les liens relatifs et les liens
 * calculés (`[routerLink]="…"`) lui échappent — c'est assumé : un gate qui
 * essaierait de les résoudre devrait exécuter l'application.
 *
 * Usage : `pnpm lint:router-links` (branché en CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/**
 * Les apps Angular à vérifier. Un seul dossier suffit : l'arbre de routes est
 * lu dans **tous** les `*.routes.ts` qu'il contient, pas seulement
 * `app.routes.ts`.
 *
 * Ça compte : le back-office a éclaté son arbre en fragments de section
 * (`pim/pim.routes.ts`, `commercial/commercial.routes.ts`…) et le gate, qui ne
 * lisait que le fichier d'assemblage, a déclaré morts vingt-et-un liens
 * parfaitement valides. Chaque fragment déclare des chemins de premier niveau
 * complets, donc l'union des fichiers redonne l'arbre.
 */
const APPS = [
  { name: "lfc-b2b-admin-frontend", root: "apps/lfc-B2B-admin-frontend/src/app" },
  { name: "lfc-b2b-platform-frontend", root: "apps/lfc-B2B-platform-frontend/src/app" },
];

/**
 * Les chemins complets déclarés par un arbre de routes.
 *
 * Lecture par **objets**, pas par indentation : une route est un `{ … }`, et
 * son chemin complet est la suite des `path:` des accolades qui l'entourent.
 * Une règle qui dépendrait du formatage se tairait le jour où il change.
 */
function declaredPaths(source) {
  const paths = new Set();
  const stack = [];
  const tokens = source.matchAll(/path:\s*'([^']*)'|[{}]/g);
  for (const token of tokens) {
    const [text, path] = token;
    if (path !== undefined) {
      if (stack.length > 0) {
        stack[stack.length - 1] = path;
      }
      continue;
    }
    if (text === "{") {
      stack.push(undefined);
      continue;
    }
    // Une accolade fermante clôt une route : son chemin complet est connu.
    const full = stack.filter((part) => part !== undefined && part !== "").join("/");
    if (full !== "" && !full.includes("**")) {
      paths.add(`/${full}`);
    }
    stack.pop();
  }
  return paths;
}

/** Un lien correspond si une route déclarée l'égale, segment à segment. */
function matches(link, declared) {
  const wanted = link.split("/").filter((s) => s !== "");
  // La racine existe toujours : c'est le `path: ''` de l'arbre, avec ou sans
  // redirection. Elle n'a pas de segment, donc rien à rapprocher.
  if (wanted.length === 0) {
    return true;
  }
  for (const path of declared) {
    const parts = path.split("/").filter((s) => s !== "");
    if (parts.length !== wanted.length) {
      continue;
    }
    // Un segment de route paramétré (`:id`) accepte n'importe quelle valeur.
    if (parts.every((part, i) => part.startsWith(":") || part === wanted[i])) {
      return true;
    }
  }
  return false;
}

function* walk(dir, suffix) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "dist") {
        yield* walk(path, suffix);
      }
    } else if (path.endsWith(suffix)) {
      yield path;
    }
  }
}

let broken = 0;
let checked = 0;

for (const app of APPS) {
  const root = join(ROOT, app.root);
  const declared = new Set();
  for (const file of walk(root, ".routes.ts")) {
    for (const path of declaredPaths(readFileSync(file, "utf8"))) {
      declared.add(path);
    }
  }
  if (declared.size === 0) {
    console.error(`✖ ${app.name} : aucune route lue — le gate ne sait plus lire l'arbre.`);
    process.exit(1);
  }
  for (const file of walk(root, ".html")) {
    const source = readFileSync(file, "utf8");
    for (const [, link] of source.matchAll(/\srouterLink="(\/[^"]*)"/g)) {
      checked += 1;
      // La partie chemin seule : un fragment ou une query ne se route pas.
      const path = link.split(/[?#]/)[0];
      if (!matches(path, declared)) {
        broken += 1;
        console.error(`✖ ${relative(ROOT, file)}\n    routerLink="${link}" ne mène à aucune route`);
      }
    }
  }
}

if (broken > 0) {
  console.error(`\n${broken} lien(s) mort(s) sur ${checked} liens absolus.`);
  process.exit(1);
}
console.log(`✓ router-links : les ${checked} liens absolus mènent tous à une route.`);
