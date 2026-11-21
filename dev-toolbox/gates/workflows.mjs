#!/usr/bin/env node
/**
 * Gate : **les workflows GitHub se lisent avant que GitHub les lise.**
 *
 * Un workflow n'était vérifié que par GitHub lui-même : une expression
 * `${{ }}` qui vise un job absent de `needs`, une clé mal placée, une entrée
 * qu'une action n'accepte pas se découvraient par un échec à 0 s sur la CI,
 * ou par un déploiement qui saute une étape sans rien dire. `actionlint` lit
 * `.github/workflows/*.yml` et refuse ces fautes avant le push.
 *
 * Le binaire est épinglé (version ET somme SHA-256 par plateforme, copiées du
 * `checksums.txt` de la release) et téléchargé une fois dans
 * `node_modules/.cache/actionlint/` : le même outil tourne au poste et en CI,
 * sans installation à la main. Une somme qui ne correspond pas arrête la
 * porte — on n'exécute pas un binaire qu'on n'a pas reconnu.
 *
 * shellcheck est coupé (`-shellcheck=`) : présent sur les runners GitHub,
 * absent de la plupart des postes, il ferait dire à la porte deux verdicts
 * différents pour le même fichier.
 *
 * Monter de version : changer `VERSION` et les quatre sommes, relancer
 * `pnpm gate workflows`.
 *
 * Usage : `pnpm gate workflows`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VERSION = "1.7.12";
const SHA256 = {
  darwin_amd64: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
  darwin_arm64: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
  linux_amd64: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  linux_arm64: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
};
const ARCH = { x64: "amd64", arm64: "arm64" };

/** La plateforme au format des archives d'actionlint, ou `null` si non prise en charge. */
function platform() {
  const arch = ARCH[process.arch];
  const key = `${process.platform}_${arch}`;
  return arch !== undefined && key in SHA256 ? key : null;
}

/** Télécharge, vérifie et extrait le binaire épinglé s'il n'est pas déjà là. */
async function ensureBinary(key) {
  const dir = join(ROOT, "node_modules/.cache/actionlint", VERSION);
  const binary = join(dir, "actionlint");
  if (existsSync(binary)) {
    return binary;
  }
  const archive = `actionlint_${VERSION}_${key}.tar.gz`;
  const url = `https://github.com/rhysd/actionlint/releases/download/v${VERSION}/${archive}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`téléchargement d'actionlint refusé (${response.status}) : ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== SHA256[key]) {
    throw new Error(`somme d'actionlint inattendue pour ${archive} : ${digest}`);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tarball = join(dir, archive);
  writeFileSync(tarball, bytes);
  const tar = spawnSync("tar", ["-xzf", tarball, "-C", dir, "actionlint"], { stdio: "inherit" });
  rmSync(tarball);
  if (tar.status !== 0) {
    throw new Error("extraction de l'archive d'actionlint impossible");
  }
  chmodSync(binary, 0o755);
  return binary;
}

async function main() {
  const key = platform();
  if (key === null) {
    console.error(
      `✗ workflows : plateforme ${process.platform}/${process.arch} sans binaire épinglé.`,
    );
    process.exit(1);
  }
  const binary = await ensureBinary(key);
  const run = spawnSync(binary, ["-shellcheck=", "-pyflakes="], { cwd: ROOT, stdio: "inherit" });
  if (run.status !== 0) {
    console.error("✗ workflows : actionlint refuse les workflows ci-dessus.");
    process.exit(1);
  }
  console.log(`✓ workflows : actionlint ${VERSION} ne trouve rien dans .github/workflows.`);
}

main().catch((error) => {
  console.error(`✗ workflows : ${error.message}`);
  process.exit(1);
});
