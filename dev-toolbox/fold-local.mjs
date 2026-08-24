#!/usr/bin/env node
/**
 * **Bidouille de développement conjoint** : brancher les fronts sur le fold-ng
 * du disque plutôt que sur celui de npm, le temps d'un aller-retour où chaque
 * ajustement du design system se répercute dans l'app.
 *
 * Le problème qu'elle résout : le catalogue épingle `fold-ng` à une version
 * EXACTE publiée. Tant qu'on dessine à deux mains — un créneau ici, une bande
 * là — chaque essai coûte un cycle complet `release → npm → catalog → install`,
 * soit plusieurs minutes et une version mineure brûlée pour un pixel.
 *
 * Ce qu'elle fait, et rien de plus : elle reconstruit `fold-ng`, **copie** son
 * `dist/` par-dessus le `node_modules/fold-ng` de chaque consommateur, puis
 * jette le pré-bundle Vite (sinon le serveur continue de servir l'ancien paquet
 * — cf. `fresh-vite-deps.mjs`, même piège).
 *
 * ## Une copie CANONIQUE, et des liens vers elle
 *
 * La forme est dictée par deux échecs mesurés, pas par le goût.
 *
 * **Lier chaque consommateur vers `fold-ng/dist` ne marche pas.** Les types se
 * résolvent depuis le chemin RÉEL, donc `fold-ng/dist/types/…` remonte vers
 * `fold-ng/node_modules/` : l'app type-checke fold contre un SECOND
 * `@angular/core`. Les types de marque d'Angular sont nominaux, alors ça sort
 * en cascade d'erreurs « Property '[SIGNAL]' is missing in type
 * 'InputSignal<T>' » qui ne pointent jamais vers leur cause.
 *
 * **Copier dans chaque consommateur ne marche pas non plus.** `@lfd/b2b-ui` est
 * consommé en SOURCE (chemins tsconfig), donc ses fichiers compilent dans le
 * programme de l'app tout en résolvant `fold-ng` depuis SON node_modules. Deux
 * copies, deux identités de module, et le compilateur Angular refuse :
 * « NG3004: Unable to import symbol FoldPageSectionComponent. The symbol is not
 * exported from … » — le symbole existe, mais il vient de l'autre copie.
 *
 * D'où la forme retenue : **une** copie, posée dans le `node_modules` de l'app
 * hôte (donc qui remonte vers l'Angular de l'app), et un lien depuis chaque
 * autre consommateur vers cette copie (donc un seul chemin réel, une seule
 * identité de module).
 *
 * ## Ce qu'elle NE fait pas, délibérément
 *
 * Elle ne touche **ni `package.json`, ni `pnpm-workspace.yaml`, ni le
 * lockfile**. Un `override` aurait été plus « propre » et c'est justement le
 * danger : il se commite, il part en CI, et la CI construirait alors contre un
 * chemin qui n'existe que sur cette machine. Ici le seul état modifié vit dans
 * `node_modules/`, que git ignore — la bidouille ne peut pas fuir dans une
 * livraison. Le prix est qu'un `pnpm install` la balaie ; c'est le bon prix,
 * et `status` le dit.
 *
 * ```
 * node dev-toolbox/fold-local.mjs on      # construit fold, lie, purge Vite
 * node dev-toolbox/fold-local.mjs sync    # reconstruit fold + purge (après une modif)
 * node dev-toolbox/fold-local.mjs off     # rend la main à la version du catalogue
 * node dev-toolbox/fold-local.mjs status  # qui est branché, sur quoi
 * ```
 *
 * Après `on` comme après `sync` : **redémarrer le serveur de dev**. Le
 * pré-bundle est jeté, pas rechargé à chaud.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Le dépôt fold-ng, voisin du monorepo. `FOLD_REPO` pour un autre chemin. */
const FOLD_REPO = resolve(process.env.FOLD_REPO ?? join(ROOT, "..", "fold-ng"));
const FOLD_DIST = join(FOLD_REPO, "dist");

/** Tout paquet du monorepo qui a résolu `fold-ng` — apps ET packages. */
function consumers() {
  const found = [];
  for (const group of ["apps", "packages"]) {
    const base = join(ROOT, group);
    if (!existsSync(base)) {
      continue;
    }
    for (const name of readdirSync(base)) {
      const link = join(base, name, "node_modules", "fold-ng");
      if (existsSync(link)) {
        found.push({ name: `${group}/${name}`, link });
      }
    }
  }
  return found;
}

/** Le témoin déposé dans une copie locale — une copie ne se distingue pas d'un
 *  paquet du store autrement, et deviner d'après la version mentirait le jour
 *  où le catalogue rattrape le dist. */
const MARKER = ".fold-local";

function isLocal(link) {
  return existsSync(join(link, MARKER));
}

function version(link) {
  try {
    const raw = readFileSync(join(link, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : "?";
  } catch {
    return "?";
  }
}

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

/** Reconstruit la bibliothèque. `ng-packagr` type-check, contrairement au
 *  build Vite de la galerie — c'est ce dist-là que l'app doit consommer. */
function build() {
  console.log(`→ build fold-ng (${FOLD_REPO})`);
  run("pnpm", ["run", "build"], FOLD_REPO);
}

/** Jette le pré-bundle Vite, sinon le serveur sert encore l'ancien paquet. */
function freshDeps() {
  run("node", [join(ROOT, "dev-toolbox", "fresh-vite-deps.mjs")], ROOT);
}

/** L'app qui héberge la copie canonique — celle sur laquelle on travaille.
 *  `FOLD_HOST` pour en désigner une autre. */
const HOST = process.env.FOLD_HOST ?? "apps/lfc-B2B-admin-frontend";

/** Une copie chez l'hôte, un lien chez les autres. */
function spread() {
  const all = consumers();
  const host = all.find(({ name }) => name === HOST);
  if (host === undefined) {
    throw new Error(
      `hôte introuvable : ${HOST}. Consommateurs vus : ${all.map((c) => c.name).join(", ")}`,
    );
  }
  rmSync(host.link, { recursive: true, force: true });
  cpSync(FOLD_DIST, host.link, { recursive: true });
  writeFileSync(join(host.link, MARKER), `${FOLD_DIST}\n`);
  console.log(`  ● ${host.name} ← copie de ${relative(ROOT, FOLD_DIST)} (${version(host.link)})`);

  for (const { name, link: path } of all) {
    if (name === HOST) {
      continue;
    }
    rmSync(path, { recursive: true, force: true });
    symlinkSync(host.link, path, "dir");
    console.log(`  → ${name} → ${HOST}`);
  }
}

function link() {
  // TOUJOURS reconstruire : un `dist/` qui traîne est le piège exact que cette
  // commande doit fermer — il a l'air valide et sert une version d'il y a trois
  // releases.
  build();
  spread();
  freshDeps();
  console.log("\n✓ fold-ng local. REDÉMARRE le serveur de dev.");
  console.log("  Après chaque modif de fold : node dev-toolbox/fold-local.mjs sync");
}

function unlink() {
  const linked = consumers().filter(({ link: p }) => isLocal(p));
  if (linked.length === 0) {
    console.log("Rien de lié — déjà sur la version du catalogue.");
    return;
  }
  for (const { name, link: path } of linked) {
    rmSync(path, { recursive: true, force: true });
    console.log(`  ← ${name} délié`);
  }
  // `install` recrée les liens du store à partir du lockfile intact.
  console.log("→ pnpm install (restaure les liens du catalogue)");
  run("pnpm", ["install"], ROOT);
  freshDeps();
  console.log("\n✓ retour à la version du catalogue. REDÉMARRE le serveur de dev.");
}

function status() {
  const all = consumers();
  if (all.length === 0) {
    console.log("Aucun consommateur de fold-ng résolu — lance `pnpm install`.");
    return;
  }
  for (const { name, link: path } of all) {
    const where = isLocal(path) ? `LOCAL ${relative(ROOT, FOLD_REPO)}` : "catalogue";
    console.log(
      `  ${isLocal(path) ? "◆" : "·"} ${name.padEnd(34)} ${version(path).padEnd(9)} ${where}`,
    );
  }
  const anyLocal = all.some(({ link: p }) => isLocal(p));
  if (anyLocal) {
    console.log("\n⚠ Un `pnpm install` balaie ces liens : relance `on` après.");
  }
}

const [, , command = "status"] = process.argv;
switch (command) {
  case "on":
    link();
    break;
  case "sync":
    build();
    spread();
    freshDeps();
    console.log("\n✓ fold-ng reconstruit et redistribué. REDÉMARRE le serveur de dev.");
    break;
  case "off":
    unlink();
    break;
  case "status":
    status();
    break;
  default:
    console.error(`Commande inconnue : ${command}. Attendu : on | sync | off | status`);
    process.exitCode = 1;
}
