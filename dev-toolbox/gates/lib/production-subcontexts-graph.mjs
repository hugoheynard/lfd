/**
 * **Le graphe du fournil, sous-contexte par sous-contexte** — la lecture que
 * `production-subcontexts.mjs` juge. Rien ici ne décide d'une faute : on lit
 * les fichiers, on les range, on relève ce qui traverse. Le jugement (dette,
 * verdict, rapport) est dans la porte.
 *
 * Fonctions pures sur `{ path, source }` : les tests les éprouvent sans
 * disque (`dev-toolbox/__tests__/production-subcontexts.test.mjs`).
 */
import { dirname, join, normalize } from "node:path";

/**
 * Le dossier de chaque sous-contexte, sous `src/production/`. Une fois un
 * fichier déplacé, c'est son dossier qui dit son sous-contexte ; tant qu'il
 * est à plat, c'est la carte (`production-subcontexts.map.json`).
 */
export const DIRECTORIES = Object.freeze({
  day: "day/",
  plan: "plan/",
  atelier: "atelier/",
  quality: "quality/",
  resupply: "resupply/",
  "shared-print": "shared/print/",
  channels: "channels/",
  workstations: "workstations/",
});

/** La racine de composition du bloc : relie tout le monde, exemptée comme `appBootstrap/`. */
export const ROOT_CONTEXT = "root";

/** Les sous-contextes qui ont une porte (`index.ts`) : `channels/` n'en est pas un (§ 1 bis). */
export const GATED = Object.freeze([
  "day",
  "plan",
  "atelier",
  "quality",
  "resupply",
  "shared-print",
  "workstations",
]);

const SHARED = ["day", "shared-print", "channels"];

/** Les arêtes admises, plan § 1 et § 1 bis ; tout le reste est refusé. */
export const ALLOWED = Object.freeze({
  day: ["channels"],
  "shared-print": ["day"],
  channels: ["day"],
  plan: [...SHARED, "resupply", "workstations"],
  atelier: [...SHARED, "quality", "workstations"],
  quality: SHARED,
  resupply: SHARED,
  // Les postes du fournil (Hugo, 2026-11-16) : le dossier (`plan`) et la
  // fiche (`atelier`) se rangent par poste, et le réglage du mode vit avec
  // la fiche. Les postes ne lisent que le partagé.
  workstations: SHARED,
});

/**
 * Les SEULS fichiers d'un sous-contexte refusé qu'un autre a le droit de lire,
 * chemin par chemin. L'imprimerie lit la couleur d'une commande pour la
 * dessiner, et rien d'autre du commerce — Hugo, 2026-11-15 : la fiche de
 * commande est un papier commun, et la collecte de sa pastille vit avec elle.
 * Et l'étiquette d'un sac, que le colisage déclare : ses mots (acheminement,
 * créneau) sont ceux des papiers du fournil, que seule l'imprimerie écrit.
 */
export const ADMITTED_FILES = Object.freeze({
  "shared-print": Object.freeze([
    /^channels\/commerce\/order-print-colors[^/]*\.ts$/u,
    /^channels\/packing\/order-label-head\.reader\.ts$/u,
  ]),
});

/** `to` est-il un fichier que `from` (sous-contexte) lit par exception nommée ? */
export function isAdmittedFile(from, to) {
  return (ADMITTED_FILES[from] ?? []).some((pattern) => pattern.test(to));
}

/** Le sous-contexte qu'un chemin donne par son dossier, ou `null` tant qu'il est à plat. */
export function contextFromPath(path) {
  for (const [context, directory] of Object.entries(DIRECTORIES)) {
    if (path.startsWith(directory)) return context;
  }
  return null;
}

/** Un fichier de test : sous `__tests__/`, libre sur l'intérieur de son sous-contexte. */
export function isTest(path) {
  return path.includes("__tests__/");
}

/** Les commentaires citent des imports et des décorateurs en prose : ils n'en sont pas. */
export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const IMPORT = /(?:^|\n)\s*((?:import|export)[\s\S]*?)from\s+["']([^"']+)["']/g;

/**
 * Les imports relatifs d'un fichier, résolus en chemins sous `production/`.
 * `typeOnly` : `import type …` / `export type …` n'émet rien à l'exécution
 * (`verbatimModuleSyntax`) — compté pour la porte, pas pour les cycles.
 */
export function importsOf(path, source) {
  const found = [];
  for (const match of withoutComments(source).matchAll(IMPORT)) {
    const specifier = match[2];
    if (!specifier.startsWith(".")) continue;
    const target = normalize(join(dirname(path), specifier.replace(/\.js$/, ".ts")));
    if (target.startsWith("..")) continue;
    found.push({
      target,
      typeOnly: /^(?:import|export)\s+type\s/.test(match[1]),
      clause: match[1],
    });
  }
  return found;
}

/**
 * Le sous-contexte de chaque fichier : son dossier s'il a déménagé, sinon la
 * carte. Un fichier ni rangé ni classé, une entrée de carte qui ne désigne
 * plus rien ou qui double un dossier, sont des problèmes à corriger.
 */
export function classify(paths, map) {
  const contexts = new Map();
  const problems = [];
  const known = new Set(paths);
  for (const path of paths.filter((p) => !isTest(p))) {
    const byPath = contextFromPath(path);
    const byMap = map[path];
    if (byPath !== null && byMap !== undefined) {
      problems.push(
        `${path}  a déménagé dans ${DIRECTORIES[byPath]} : retire-le de la carte, le dossier fait foi`,
      );
    } else if (byPath === null && byMap === undefined) {
      problems.push(
        `${path}  n'est ni dans un dossier de sous-contexte ni dans la carte : classe-le`,
      );
    } else if (byPath === null && !(byMap in ALLOWED) && byMap !== ROOT_CONTEXT) {
      problems.push(`${path}  classé « ${byMap} », qui n'est pas un sous-contexte`);
    }
    contexts.set(path, byPath ?? byMap);
  }
  for (const path of Object.keys(map)) {
    if (!known.has(path))
      problems.push(`${path}  est dans la carte mais n'existe plus : retire-le`);
  }
  return { contexts, problems };
}

/**
 * Le sous-contexte d'un test : son dossier ; à plat, celui du fichier qu'il
 * éprouve (`__tests__/x.spec.ts` → `x.ts`) ; à défaut, celui de la majorité
 * de ce qu'il importe (un double partagé). `null` s'il n'importe rien du bloc.
 */
export function testContext(path, imports, contexts) {
  const byPath = contextFromPath(path);
  if (byPath !== null) return byPath;
  const subject = path.replace(/__tests__\/(?:.*\/)?([^/]+?)\.(?:e2e-)?spec\.ts$/, "$1.ts");
  if (contexts.has(subject)) return contexts.get(subject);
  const votes = new Map();
  for (const { target } of imports) {
    const context = contexts.get(target);
    if (context === undefined || context === "channels" || context === ROOT_CONTEXT) continue;
    votes.set(context, (votes.get(context) ?? 0) + 1);
  }
  const ranked = [...votes].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return ranked[0]?.[0] ?? null;
}

/** La porte d'un sous-contexte. */
export function doorOf(context) {
  return `${DIRECTORIES[context]}index.ts`;
}

/**
 * Le module Nest d'un sous-contexte : un `*.module.ts` à la racine de son
 * dossier. C'est la seconde porte (§ 1 bis : « un module n'injecte que ce
 * qu'un autre exporte »), et un module de métier n'entre chez un autre que
 * par elle — `day/index.ts` ne peut pas l'exporter, le module de la journée
 * charge des canaux.
 */
export function isContextModule(path, context) {
  const directory = DIRECTORIES[context];
  if (directory === undefined || !path.startsWith(directory)) return false;
  const rest = path.slice(directory.length);
  return !rest.includes("/") && rest.endsWith(".module.ts");
}

/** Les modèles du schéma `production` : `{ name, accessor, table }`. */
export function productionModels(schemaSource) {
  const models = [];
  for (const match of schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (!/@@schema\("production"\)/.test(match[2])) continue;
    const table = /@@map\("([^"]+)"\)/.exec(match[2])?.[1] ?? match[1];
    models.push({ name: match[1], accessor: match[1][0].toLowerCase() + match[1].slice(1), table });
  }
  return models;
}

const OPERATIONS = "find\\w*|count|aggregate|groupBy|create\\w*|update\\w*|upsert|delete\\w*";

/** Les modèles qu'un fichier lit ou écrit : accès Prisma (`tx.x.find…`) ou SQL écrit à la main. */
export function modelsTouched(source, models) {
  const clean = withoutComments(source);
  const touched = new Set();
  for (const model of models) {
    const accessor = new RegExp(`\\.\\s*${model.accessor}\\s*\\.\\s*(?:${OPERATIONS})\\b`);
    const table = new RegExp(`"?production"?\\s*\\.\\s*"?${model.table}"?(?![\\w])`);
    if (accessor.test(clean) || table.test(clean)) touched.add(model.name);
  }
  return [...touched];
}

/** Les faits écoutés EN MÉMOIRE, avec le fichier d'où chacun est importé. */
export function memorySubscriptions(path, source) {
  const clean = withoutComments(source);
  const origins = new Map();
  for (const { target, clause } of importsOf(path, clean)) {
    const names = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
    for (const raw of names.split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop();
      if (name) origins.set(name, target);
    }
  }
  const found = [];
  for (const decorator of clean.matchAll(/@EventsHandler\(([^)]*)\)/g)) {
    for (const name of decorator[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      found.push({ event: name, origin: origins.get(name) ?? null });
    }
  }
  return found;
}

/**
 * Les cycles d'exécution (imports de valeur) qui traversent un `index.ts` :
 * un cycle de « barrels » rend une classe `undefined` quand Nest lit ses
 * métadonnées, et l'API ne démarre pas. Tarjan, composantes de plus d'un fichier.
 */
export function indexCycles(edges) {
  const graph = new Map();
  for (const [from, to] of edges) {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let counter = 0;
  const visit = (node) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };
  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return components
    .filter((component) =>
      component.some((path) => path.endsWith("/index.ts") || path === "index.ts"),
    )
    .map((component) => component.filter((path) => path.endsWith("index.ts")).join(" + "));
}
