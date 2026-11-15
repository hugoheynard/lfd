/**
 * **Ce que les imports ne montrent pas** — la lecture que
 * `production-subcontexts.mjs` ajoute au graphe du fournil : les messages du
 * bus, les racines qui relient le fournil, et les fournisseurs de ses modules.
 *
 * - **Le bus de `@nestjs/cqrs` est global** : une commande envoyée, une
 *   requête posée, un fait écouté atteignent leur handler sans que rien ne
 *   l'importe. On lit donc la CLASSE du message, et on remonte les
 *   réexportations (`index.ts`, canaux) jusqu'au fichier qui la déclare :
 *   c'est l'arête déclarant → utilisateur qu'on juge, pas le chemin d'import.
 * - **Les racines** (`appBootstrap/`, `dev/`) entrent dans le fournil par ses
 *   portes : un `index.ts` de métier, un module de métier, le module du bloc,
 *   ou un canal (public par nature).
 * - **Un fournisseur ne vit que dans UN module** : Nest en fait un exemplaire
 *   par module qui le déclare, et un service qui garde quelque chose en
 *   mémoire aurait deux caches qui divergent sans qu'aucun test le voie.
 *
 * Fonctions pures sur `{ path, source }`, éprouvées par
 * `dev-toolbox/__tests__/production-subcontexts.test.mjs`.
 */
import {
  ALLOWED,
  DIRECTORIES,
  GATED,
  ROOT_CONTEXT,
  doorOf,
  importsOf,
  isAdmittedFile,
  isTest,
  withoutComments,
} from "./production-subcontexts-graph.mjs";

const DECLARED =
  /(?:^|\n)\s*export\s+(?:default\s+)?(?:abstract\s+)?(?:class|const|let|function|enum|interface|type)\s+(\w+)/g;

/** Les noms d'une clause `{ a, type b, c as d }` : `[local, exporté]`. */
function namesOf(clause) {
  const inner = /\{([^}]*)\}/.exec(clause)?.[1] ?? "";
  return inner
    .split(",")
    .map((raw) => raw.trim().replace(/^type\s+/, ""))
    .filter(Boolean)
    .map((raw) => {
      const [local, alias] = raw.split(/\s+as\s+/);
      return [local, alias ?? local];
    });
}

/** Par fichier : les noms qu'il déclare, et ceux qu'il réexporte d'ailleurs. */
export function declarationsOf(files) {
  const table = new Map();
  for (const { path, source } of files) {
    const clean = withoutComments(source);
    const declared = new Set([...clean.matchAll(DECLARED)].map((match) => match[1]));
    const reexports = new Map();
    const stars = [];
    for (const { target, clause } of importsOf(path, clean)) {
      if (!clause.startsWith("export")) continue;
      if (/^export\s+\*/.test(clause)) stars.push(target);
      for (const [local, exported] of namesOf(clause)) reexports.set(exported, { target, local });
    }
    table.set(path, { declared, reexports, stars });
  }
  return table;
}

/** Le fichier qui déclare `name` tel que `path` l'exporte, ou `null`. */
export function declaringFile(name, path, table, seen = new Set()) {
  const entry = table.get(path);
  if (entry === undefined || seen.has(path)) return null;
  seen.add(path);
  if (entry.declared.has(name)) return path;
  const hop = entry.reexports.get(name);
  if (hop !== undefined) return declaringFile(hop.local, hop.target, table, seen);
  for (const star of entry.stars) {
    const found = declaringFile(name, star, table, seen);
    if (found !== null) return found;
  }
  return null;
}

const SENT = [/new\s+(\w+(?:Command|Query))\s*\(/g, /execute\s*<\s*(\w+(?:Command|Query))\b/g];

/**
 * Les messages qu'un fichier touche : `send` (envoyer une commande, poser une
 * requête), `handle` (`@CommandHandler`, `@QueryHandler` : en être le
 * propriétaire), `listen` (`@EventsHandler`, `@DurableHandler`).
 */
export function messagesOf(source) {
  const clean = withoutComments(source);
  const found = [];
  for (const pattern of SENT) {
    for (const match of clean.matchAll(pattern)) found.push({ kind: "send", name: match[1] });
  }
  for (const match of clean.matchAll(/@(?:Command|Query)Handler\(\s*(\w+)/g)) {
    found.push({ kind: "handle", name: match[1] });
  }
  for (const match of clean.matchAll(/@EventsHandler\(([^)]*)\)/g)) {
    for (const name of match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      found.push({ kind: "listen", name });
    }
  }
  for (const match of clean.matchAll(/@DurableHandler\(\s*\{[^}]*\btype:\s*(\w+)/g)) {
    found.push({ kind: "listen", name: match[1] });
  }
  return found;
}

/** Où `path` prend le nom `name` : `{ entry, declaring }`, ou `null` s'il vient d'hors du bloc. */
function originOf(name, path, table) {
  if (table.get(path)?.declared.has(name)) return { entry: path, declaring: path };
  for (const { target, clause } of importsOf(
    path,
    withoutComments(table.get(path)?.source ?? ""),
  )) {
    const hit = namesOf(clause).find(([, local]) => local === name);
    if (hit === undefined) continue;
    const declaring = declaringFile(hit[0], target, table);
    return declaring === null ? null : { entry: target, declaring };
  }
  return null;
}

/** Ce qu'un usage de message viole, ou `null`. */
function judgeMessage(own, kind, entry, theirs, declaring) {
  if (theirs === undefined || theirs === own) return null;
  if (kind === "handle") return "handler d'un message d'un autre métier";
  if (!ALLOWED[own]?.includes(theirs) && !isAdmittedFile(own, declaring)) return "arête refusée";
  if (GATED.includes(theirs) && entry !== doorOf(theirs)) return `hors de ${doorOf(theirs)}`;
  return null;
}

/**
 * Les messages touchés hors des arêtes admises, ou à côté de la porte de
 * leur métier : `chemin → Classe (métier déclarant, raison)`.
 */
export function crossMessages(files, contexts) {
  const table = declarationsOf(files);
  for (const { path, source } of files) table.get(path).source = source;
  const found = new Set();
  for (const { path, source } of files) {
    const own = contexts.get(path);
    if (isTest(path) || own === undefined || own === ROOT_CONTEXT) continue;
    for (const { kind, name } of messagesOf(source)) {
      const origin = originOf(name, path, table);
      if (origin === null) continue;
      const theirs = contexts.get(origin.declaring);
      const why = judgeMessage(own, kind, origin.entry, theirs, origin.declaring);
      if (why !== null) found.add(`${path} → ${name} (${theirs}, ${why})`);
    }
  }
  return found;
}

/** Une entrée du fournil admise pour une racine (chemin sous `src/`). */
export function isRootEntry(target) {
  if (!target.startsWith("production/")) return true;
  const inner = target.slice("production/".length);
  if (inner === "production.module.ts" || inner.startsWith(DIRECTORIES.channels)) return true;
  return GATED.some((context) => {
    const directory = DIRECTORIES[context];
    if (!inner.startsWith(directory)) return false;
    const rest = inner.slice(directory.length);
    return rest === "index.ts" || (!rest.includes("/") && rest.endsWith(".module.ts"));
  });
}

/** Par fichier de racine (chemins sous `src/`), le nombre d'imports à côté des portes du fournil. */
export function rootImports(files) {
  const found = new Map();
  for (const { path, source } of files) {
    const count = importsOf(path, source).filter(({ target }) => !isRootEntry(target)).length;
    if (count > 0) found.set(path, count);
  }
  return found;
}

/** Les éléments de premier niveau du tableau `key: [ … ]` d'un `@Module`. */
function arrayItems(source, key) {
  const start = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(source);
  if (start === null) return [];
  const items = [];
  let depth = 0;
  let current = "";
  for (const char of source.slice(start.index + start[0].length)) {
    if (depth === 0 && (char === "," || char === "]")) {
      if (current.trim()) items.push(current.trim());
      current = "";
      if (char === "]") break;
      continue;
    }
    if ("[{(".includes(char)) depth += 1;
    if ("]})".includes(char)) depth -= 1;
    current += char;
  }
  return items;
}

/** Les fournisseurs et contrôleurs qu'un module déclare (le jeton, pour `{ provide }`). */
export function moduleProvidersOf(source) {
  const clean = withoutComments(source);
  return ["providers", "controllers"].flatMap((key) =>
    arrayItems(clean, key)
      .map((item) => (item.startsWith("{") ? /provide\s*:\s*(\w+)/.exec(item)?.[1] : item))
      .filter((name) => name !== undefined && /^\w+$/.test(name)),
  );
}

/** Les fournisseurs déclarés dans plus d'un module du fournil : `Nom : a + b`. */
export function duplicatedProviders(files) {
  const owners = new Map();
  for (const { path, source } of files) {
    if (isTest(path) || !path.endsWith(".module.ts")) continue;
    for (const name of new Set(moduleProvidersOf(source))) {
      owners.set(name, [...(owners.get(name) ?? []), path]);
    }
  }
  return new Set(
    [...owners]
      .filter(([, paths]) => paths.length > 1)
      .map(([name, paths]) => `${name} : ${paths.sort().join(" + ")}`),
  );
}
