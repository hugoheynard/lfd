#!/usr/bin/env node
/**
 * Gate : on ne lit **que** des variables fold qui existent.
 *
 * Une variable CSS inconnue ne casse rien — c'est tout le problème. La
 * déclaration est simplement ignorée, ou le repli s'applique, et la page a
 * l'air correcte. Le token mort ne se voit ni au build, ni au type-check, ni au
 * test : il se voit le jour où quelqu'un change le thème et où cette règle-là
 * ne suit pas.
 *
 * D'où ce gate : la **liste des tokens fold** vient du paquet installé
 * (`fold-ng/tokens/*.css`), donc elle est toujours celle de la version qu'on
 * utilise vraiment. Toute lecture `var(--fold-…)` d'un nom absent de cette
 * liste échoue.
 *
 * Deux lectures restent légitimes et ne sont pas comptées :
 *
 * - un fichier qui **déclare** lui-même le token (bouton de thème local, par
 *   exemple `--fold-product-card-radius` posé puis lu par le même composant) ;
 * - un fichier qui **surcharge** un token fold pour l'application entière (le
 *   `styles.scss` d'une app), pour la même raison.
 *
 * Usage : `pnpm lint:fold-tokens` (branché en CI).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

/**
 * Résolution depuis une app front et non depuis la racine : `fold-ng` est une
 * dépendance des apps, pas du dépôt, et la racine ne le voit donc pas. Toutes
 * les apps pointent la même version — le `catalog:` de `pnpm-workspace.yaml`
 * l'épingle une fois pour toutes.
 */
const FOLD_HOST = "apps/lfc-B2B-admin-frontend/package.json";

/** Les tokens déclarés par la version de fold-ng réellement installée. */
function declaredTokens() {
  const require = createRequire(join(ROOT, FOLD_HOST));
  const tokensDir = join(dirname(require.resolve("fold-ng/package.json")), "tokens");
  const declared = new Set();
  for (const file of readdirSync(tokensDir)) {
    if (!file.endsWith(".css")) {
      continue;
    }
    const css = readFileSync(join(tokensDir, file), "utf8");
    for (const match of css.matchAll(/(--fold-[a-z0-9-]+)\s*:/gu)) {
      declared.add(match[1]);
    }
  }
  return declared;
}

/** Les fichiers de style et de composant suivis par git. */
function trackedFiles() {
  const patterns = ["scss", "css", "html", "ts"].flatMap((ext) => [
    `apps/*.${ext}`,
    `packages/*.${ext}`,
  ]);
  return execFileSync("git", ["ls-files", ...patterns], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

const declared = declaredTokens();
const violations = [];

for (const rel of trackedFiles()) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (!text.includes("var(--fold-")) {
    continue;
  }
  // Portée fichier : ce que le fichier déclare, il a le droit de le lire.
  const own = new Set([...text.matchAll(/(--fold-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]));

  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--fold-[a-z0-9-]+)/gu)) {
      const token = match[1];
      if (!declared.has(token) && !own.has(token)) {
        violations.push([`${rel}:${index + 1}`, token]);
      }
    }
  });
}

if (violations.length > 0) {
  console.error("\n✖ Variables fold inexistantes lues :\n");
  for (const [where, token] of violations) {
    console.error(`  ${where}\n      → ${token}`);
  }
  console.error(
    `\n${declared.size} tokens existent dans la version installée de fold-ng.\n` +
      "Voir node_modules/fold-ng/tokens/*.css pour la liste, ou déclarer le\n" +
      "bouton localement si c’est un réglage propre au composant.\n",
  );
  process.exit(1);
}

console.log(
  `✓ fold-tokens : toutes les lectures visent l’un des ${declared.size} tokens existants`,
);
