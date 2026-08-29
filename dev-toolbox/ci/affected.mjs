#!/usr/bin/env node
/**
 * Quels JOBS de la CI ce commit concerne-t-il vraiment ?
 *
 * Le dépôt embarque turborepo depuis toujours et la CI ne s'en servait pas :
 * elle relançait les quatre chantiers à chaque push. Or la promotion du
 * 2026-08-29 portait 369 fichiers de front pour 14 de backend — les e2e
 * backend, qui tiennent le chemin critique, n'avaient aucune raison de tourner.
 *
 * On ne réécrit pas les étapes à travers turbo ; on lui demande seulement ce
 * qu'il sait et que `git diff` ignore : le GRAPHE. Un paquet touché entraîne
 * tout ce qui en dépend, et c'est exactement ce que `--filter=...[base]`
 * calcule. Un `git diff --name-only` dirait « seul packages/contracts a
 * changé » sans voir que trois apps le consomment.
 *
 * ⚠️ RÈGLE DE SÛRETÉ : dans le doute, on lance TOUT.
 *
 * Une base introuvable (premier push d'une branche, force-push, historique
 * tronqué), une sortie qu'on ne sait pas lire, turbo absent — chacun de ces cas
 * rend `true` partout. Un job lancé pour rien coûte des minutes ; un job sauté
 * à tort laisse passer une régression, et la porte de qualité ne vaut alors
 * plus rien. Les deux erreurs ne se paient pas dans la même monnaie.
 *
 * Deux conséquences à connaître. Le paquet racine `//` compte comme « tout » : il représente les fichiers du
 * dépôt lui-même — la CI, les gates, le lockfile, le catalogue. Y toucher peut
 * changer n'importe quel résultat. Et tout ce qui n'appartient à AUCUN paquet —
 * `documentation/`, un README de racine — y est rattaché : un commit de
 * documentation relance donc tout. C'est du gâchis assumé, du bon côté.
 */
import { execFileSync } from "node:child_process";

/** Les jobs de `ci.yml`, et les paquets qui les concernent. */
const AREAS = {
  packages: (name) => name.startsWith("@lfd/"),
  api: (name) => name === "lfd-api",
  // Les deux fronts SÉPARÉMENT : ils ont chacun leur job, donc un commit qui ne
  // touche que la boutique n'a aucune raison de relancer l'admin — ni ses 745
  // tests, ni sa compilation AOT.
  front_admin: (name) => name === "lfc-b2b-admin-frontend",
  front_platform: (name) => name === "lfc-b2b-platform-frontend",
  gateway: (name) => name === "lfd-gateway",
};

const ALL = Object.fromEntries(Object.keys(AREAS).map((key) => [key, true]));

/** Les paquets en aval du diff, selon le graphe de turbo. `null` = on ne sait pas. */
function affectedPackages(base) {
  const output = execFileSync(
    "npx",
    ["turbo", "run", "build", `--filter=...[${base}]`, "--dry=json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.packages) ? parsed.packages : null;
}

function decide(base) {
  if (!base) {
    return { areas: ALL, why: "aucune base de comparaison" };
  }
  let packages;
  try {
    packages = affectedPackages(base);
  } catch {
    return { areas: ALL, why: `turbo n'a pas su comparer à « ${base} »` };
  }
  if (packages === null) {
    return { areas: ALL, why: "sortie de turbo illisible" };
  }
  if (packages.includes("//")) {
    return { areas: ALL, why: "la racine du dépôt est touchée (CI, gates, lockfile…)" };
  }
  const areas = Object.fromEntries(
    Object.entries(AREAS).map(([key, matches]) => [key, packages.some(matches)]),
  );
  return { areas, why: `paquets en aval : ${packages.join(", ") || "aucun"}` };
}

const { areas, why } = decide(process.argv[2]);
console.error(`Périmètre : ${why}`);
for (const [key, value] of Object.entries(areas)) {
  console.error(`  ${key.padEnd(15)} ${value ? "→ à lancer" : "→ sauté"}`);
  console.log(`${key}=${value}`);
}
