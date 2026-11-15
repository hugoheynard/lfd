/**
 * **Le rapport de `production-subcontexts.mjs`** quand la porte passe : la
 * carte des sous-contextes et de leur surface, puis la dette restante, comptée.
 * Rien ici ne juge : la porte a déjà rendu son verdict.
 */
import { GATED, ROOT_CONTEXT } from "./production-subcontexts-graph.mjs";

function addTo(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

/** La carte : par sous-contexte, ses fichiers, et ce qu'il utilise chez les autres. */
function printMap(contexts, surface, detailed) {
  const owners = new Map();
  for (const [path, context] of contexts) addTo(owners, context, path);
  const uses = new Map();
  for (const [theirs, entries] of surface) {
    for (const entry of entries)
      addTo(uses, entry.split("\t")[1], `${theirs}\t${entry.split("\t")[0]}`);
  }
  console.log("  La carte (fichiers hors tests) :");
  for (const context of [...GATED, "channels", ROOT_CONTEXT]) {
    const used = [...(uses.get(context) ?? [])].map((entry) => entry.split("\t"));
    const byTarget = new Map();
    for (const [theirs, file] of used) addTo(byTarget, theirs, file);
    const summary = [...byTarget].map(([theirs, set]) => `${theirs} ${set.size}`).join(", ");
    const exposed = new Set([...(surface.get(context) ?? [])].map((entry) => entry.split("\t")[0]));
    console.log(
      `    ${context.padEnd(13)} ${String(owners.get(context)?.size ?? 0).padStart(3)} fichiers · ` +
        `surface ${String(exposed.size).padStart(3)} · utilise : ${summary || "—"}`,
    );
    if (detailed) for (const file of [...exposed].sort()) console.log(`        ${file}`);
  }
}

/** La carte, puis la dette restante ; `detailed` : la surface fichier par fichier. */
export function printReport(contexts, surface, found, detailed) {
  printMap(contexts, surface, detailed);
  const total = (name) => [...found[name].values()].reduce((sum, count) => sum + count, 0);
  console.log("  Dette restante — comptée, pas ignorée :");
  console.log(`    arêtes hors du schéma    ${found.edges.size}`);
  console.log(
    `    imports hors porte       ${total("door")}  (${[...found.door].map(([p, c]) => `${p} ${c}`).join(", ")})`,
  );
  console.log(`    tests hors porte         ${total("testDoor")}`);
  console.log(`    modèles hors propriétaire ${found.models.size}`);
  console.log(`    abonnés en mémoire       ${found.subscribers.size}`);
  console.log(`    cycles par un index.ts   ${found.indexCycles.length}`);
  console.log(`    messages hors porte      ${found.messages.size}`);
  console.log(`    racines hors porte       ${total("roots")}`);
}
