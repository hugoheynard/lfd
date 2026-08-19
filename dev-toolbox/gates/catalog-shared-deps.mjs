#!/usr/bin/env node
/**
 * Gate : **une dépendance partagée passe par le catalogue.**
 *
 * Dès qu'un paquet externe est déclaré par deux `package.json` du dépôt, sa
 * version doit venir du `catalog:` de `pnpm-workspace.yaml` — pas d'une plage
 * recopiée. La raison n'est pas l'esthétique : deux versions d'un même paquet
 * dans un monorepo ne se voient pas, elles se découvrent.
 *
 * · Deux zod → deux schémas « identiques » cessent de s'accepter.
 * · Deux ESLint ou deux Prettier → le même fichier est conforme ici, fautif là.
 * · Deux @nestjs/core → une erreur de DI au démarrage, sans cause nommée.
 * · Deux Angular → une lib compilée contre une version que personne n'exécute.
 *
 * Chacun de ces cas a été rencontré ; le gate existe pour qu'aucun ne revienne.
 *
 * Ce que le gate NE fait pas : imposer le catalogue à un paquet à consommateur
 * unique (helmet, stripe, jose, capacitor…). Une entrée de catalogue pour un
 * seul lecteur n'aligne rien — elle éloigne juste la version de son usage.
 *
 * Exception assumée : les `peerDependencies`. Un pair est une PLAGE de
 * compatibilité annoncée aux consommateurs ; l'épingler exact le transformerait
 * en exigence, ce qui est le contraire de son rôle.
 *
 * Usage : `pnpm lint:catalog-shared-deps` (branché en CI).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Les manifestes du dépôt : la racine, chaque app, chaque package, la passerelle. */
function manifests() {
  const found = ["package.json"];
  for (const dir of ["apps", "packages"]) {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const file = join(dir, entry, "package.json");
      if (existsSync(join(ROOT, file))) {
        found.push(file);
      }
    }
  }
  if (existsSync(join(ROOT, "gateway/package.json"))) {
    found.push("gateway/package.json");
  }
  return found;
}

/** `{ paquet -> { manifeste -> version déclarée } }`, pairs et liens internes exclus. */
function declarations(files) {
  const byPackage = new Map();
  for (const file of files) {
    const manifest = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    for (const section of ["dependencies", "devDependencies"]) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        if (range.startsWith("workspace:")) {
          continue;
        }
        const seen = byPackage.get(name) ?? new Map();
        seen.set(file, range);
        byPackage.set(name, seen);
      }
    }
  }
  return byPackage;
}

const offenders = [];
for (const [name, seen] of declarations(manifests())) {
  if (seen.size < 2) {
    continue;
  }
  const strays = [...seen].filter(([, range]) => range !== "catalog:");
  if (strays.length > 0) {
    offenders.push({ name, strays });
  }
}

if (offenders.length === 0) {
  console.log("✅ Toute dépendance partagée passe par le catalogue.");
  process.exit(0);
}

console.error("❌ Dépendances partagées déclarées hors du catalogue :\n");
for (const { name, strays } of offenders.sort((a, b) => a.name.localeCompare(b.name))) {
  console.error(`  ${name}`);
  for (const [file, range] of strays) {
    console.error(`      ${file} → ${range}`);
  }
}
console.error(
  "\nAjouter une entrée dans le `catalog:` de pnpm-workspace.yaml, puis remplacer" +
    "\nchaque plage par \"catalog:\" dans les manifestes ci-dessus.",
);
process.exit(1);
