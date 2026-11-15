/**
 * **La taille de chaque porte** de `production-subcontexts.mjs` : le nombre de
 * noms qu'exporte `<métier>/index.ts`.
 *
 * Le noyau est le tronc sur lequel poussent les métiers (plan
 * `documentation/fournil/plan-decoupage-du-fournil.md`, lot 9) : un métier neuf
 * doit n'en apprendre que quelques entrées stables. Un index qui grandit en
 * silence redevient une trentaine de petites pièces. La taille est donc une
 * dette qui ne peut que décroître : un index qui grandit échoue, un index qui
 * rétrécit demande d'abaisser le compte (sans quoi la marge resterait un
 * passe-droit).
 */
import { DIRECTORIES, GATED, withoutComments } from "./production-subcontexts-graph.mjs";

const EXPORT_LIST = /export\s+(?:type\s+)?\{([^}]*)\}/g;
const EXPORT_DECLARATION =
  /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_STAR = /export\s+\*/;

/**
 * Les noms qu'exporte la source d'un `index.ts`. `export { a as b }` compte
 * `b` une fois ; un `export *` rend `null` : sa taille ne se lit pas sans
 * suivre le fichier, et la porte le refuse.
 */
export function exportedNames(source) {
  const plain = withoutComments(source);
  if (EXPORT_STAR.test(plain)) return null;
  const names = new Set();
  for (const match of plain.matchAll(EXPORT_LIST)) {
    for (const entry of match[1].split(",")) {
      const name = entry
        .trim()
        .replace(/^type\s+/u, "")
        .split(/\s+as\s+/u)
        .pop()
        .trim();
      if (name !== "") names.add(name);
    }
  }
  for (const match of plain.matchAll(EXPORT_DECLARATION)) names.add(match[1]);
  return names;
}

/**
 * La taille de l'index de chaque métier qui en a un, sur `{ path, source }`
 * (chemins sous `production/`). `problems` reçoit un `export *`.
 */
export function indexSizes(files, problems = []) {
  const sizes = new Map();
  for (const context of GATED) {
    const door = `${DIRECTORIES[context]}index.ts`;
    const file = files.find((candidate) => candidate.path === door);
    if (file === undefined) continue;
    const names = exportedNames(file.source);
    if (names === null) {
      problems.push(`${door} : un export * cache sa taille — nomme ce que la porte exporte`);
      continue;
    }
    sizes.set(context, names.size);
  }
  return sizes;
}

/** Le verdict sur les tailles : ce qui a grandi, ce qui a baissé sans que le compte suive. */
export function indexSizeFailures(sizes, admitted = {}) {
  const failures = [];
  for (const [context, size] of sizes) {
    const allowed = admitted[context] ?? 0;
    if (size > allowed) {
      failures.push(
        `  ${context}  ${size} noms exportés par l'index, la dette en admet ${allowed} — ` +
          `regroupe, ou rends au métier qui le lit seul ce que l'index n'a pas à porter`,
      );
    }
  }
  for (const [context, allowed] of Object.entries(admitted)) {
    const size = sizes.get(context) ?? 0;
    if (size < allowed) {
      failures.push(
        `  ${context}  ${size} noms exportés par l'index, la dette en compte ${allowed} — baisse le compte (indexSize)`,
      );
    }
  }
  return failures;
}
