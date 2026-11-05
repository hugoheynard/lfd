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
 * changer n'importe quel résultat. Et tout ce qui n'appartient à AUCUN paquet
 * y est rattaché par turbo.
 *
 * 🔴 **Sauf `documentation/`, depuis le 2026-11-05** (Hugo). Presque chaque
 * commit porte une ligne de plan ou de registre : la racine valait « tout » à
 * chaque push, et un lot du seul front lançait les vingt éclats e2e du
 * backend (16 min au lieu de ~5). Aucun code ni test ne lit `documentation/`
 * (vérifié le 2026-11-05 : aucun import, aucune lecture de fichier sous
 * `apps/`, `packages/`, `gateway/`) ; ce qui l'y relie — références, orphelins,
 * Mermaid, recueils générés (`rgaa-digest`, `shop-copy-digest`) — est tenu
 * par les portes du job global, qui tourne à chaque push. Un fichier de la
 * racine HORS de `documentation/` relance toujours tout.
 */
import { execFileSync } from "node:child_process";

/** Les jobs de `ci.yml`, et les paquets qui les concernent. */
const AREAS = {
  packages: (name) => name.startsWith("@lfd/"),
  api: (name) => name === "lfd-api",
  // Les deux fronts SÉPARÉMENT : ils ont chacun leur job, donc un commit qui ne
  // touche que la boutique n'a aucune raison de relancer l'admin — ni ses 745
  // tests, ni sa compilation AOT.
  front_admin: (name) => name === "lfd-backoffice-frontend",
  front_platform: (name) => name === "lfc-ecommerce-frontend",
  gateway: (name) => name === "lfd-gateway",
  // Le Worker de la carte routière (plan de tournée, lot 8) : un paquet sans
  // dépendance interne, donc aucun autre job ne le couvrait.
  route_planner: (name) => name === "lfd-route-planner",
};

/**
 * Les jobs décidés par CHEMIN, et non par paquet : `facturx-mustang` ne
 * concerne qu'un coin de `lfd-api`, et le relancer sur tout commit du backend
 * coûterait une minute pour rien. Les fichiers qui le décident sont nommés
 * ici ; la racine touchée le relance comme les autres (cf. plus bas).
 */
const PATH_AREAS = {
  facturx: (file) =>
    file.startsWith("apps/lfd-api/src/b2b/accounting/") ||
    file.startsWith("packages/money/") ||
    file.startsWith("dev-toolbox/ci/facturx-mustang/") ||
    file === "apps/lfd-api/package.json" ||
    file === ".github/workflows/ci.yml",
};

const ALL = Object.fromEntries(
  [...Object.keys(AREAS), ...Object.keys(PATH_AREAS)].map((key) => [key, true]),
);

/** Les dossiers des paquets du workspace (`pnpm-workspace.yaml`). */
const PACKAGE_ROOTS = [/^apps\/[^/]+\//u, /^packages\/[^/]+\//u, /^gateway\//u];

/**
 * Ce fichier rattache-t-il le diff à la racine pour une AUTRE raison que la
 * documentation ? Un fichier hors de tout paquet et hors de `documentation/`
 * (la CI, une porte, le lockfile, un fichier de config racine) : oui.
 */
function touchesRootBeyondDocs(file) {
  if (PACKAGE_ROOTS.some((root) => root.test(file))) {
    return false;
  }
  return !file.startsWith("documentation/");
}

/** Les fichiers modifiés depuis la base. Lève si git ne sait pas comparer. */
function changedFiles(base) {
  const output = execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.split("\n").filter(Boolean);
}

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
  let files;
  try {
    files = changedFiles(base);
  } catch {
    return { areas: ALL, why: `git n'a pas su comparer à « ${base} »` };
  }
  if (packages.includes("//") && files.some(touchesRootBeyondDocs)) {
    return { areas: ALL, why: "la racine du dépôt est touchée (CI, gates, lockfile…)" };
  }
  packages = packages.filter((name) => name !== "//");
  const areas = Object.fromEntries([
    ...Object.entries(AREAS).map(([key, matches]) => [key, packages.some(matches)]),
    ...Object.entries(PATH_AREAS).map(([key, matches]) => [key, files.some(matches)]),
  ]);
  return { areas, why: `paquets en aval : ${packages.join(", ") || "aucun"}` };
}

const { areas, why } = decide(process.argv[2]);
console.error(`Périmètre : ${why}`);
for (const [key, value] of Object.entries(areas)) {
  console.error(`  ${key.padEnd(15)} ${value ? "→ à lancer" : "→ sauté"}`);
  console.log(`${key}=${value}`);
}
