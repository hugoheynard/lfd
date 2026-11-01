#!/usr/bin/env node
/**
 * **Mustang sur les témoins Factur-X** — job CI `facturx-mustang`.
 *
 *   node dev-toolbox/ci/facturx-mustang/validate.mjs <Mustang-CLI.jar> <dossier>
 *       [--docker <image java>]
 *
 * Passe chaque `.pdf` et `.xml` du dossier (écrits par `pnpm --filter lfd-api
 * facturx:samples`) à `--action validate`, et lit le rapport XML que Mustang
 * écrit sur sa sortie standard — dans un fichier, jamais derrière un pipe :
 * le code de sortie lu est celui de Java. Les rapports sont gardés dans
 * `<dossier>-mustang/`.
 *
 * Un fichier échoue si Java ne rend pas 0, si un `<summary status=` ne vaut
 * pas `valid`, s'il porte un `<error`, ou s'il porte un `<warning` dont l'ID
 * n'est pas dans `allowed-warnings.json`. Un avertissement SANS ID (Mustang en
 * émet, ex. les écarts arithmétiques de type 10) n'est jamais admis : on ne
 * peut pas l'inscrire sans admettre toute sa famille.
 *
 * `--docker` sert à l'essai local, sur un poste sans Java : la même logique,
 * Java pris dans l'image.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOWED = new Map(
  JSON.parse(readFileSync(join(HERE, "allowed-warnings.json"), "utf8")).warnings.map((w) => [
    w.id,
    w.why,
  ]),
);

function parseArgs(argv) {
  const [jar, directory, flag, image] = argv;
  if (!jar || !directory || (flag !== undefined && (flag !== "--docker" || !image))) {
    process.stderr.write("Usage : validate.mjs <jar> <dossier> [--docker <image>]\n");
    process.exit(2);
  }
  return { jar: resolve(jar), directory: resolve(directory), image: image ?? null };
}

function runMustang({ jar, directory, image }, file) {
  const mustang = ["--no-notices", "--action", "validate"];
  const [command, args] = image
    ? [
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${directory}:/w:ro`,
          "-v",
          `${jar}:/mustang.jar:ro`,
          image,
          "java",
          "-jar",
          "/mustang.jar",
          ...mustang,
          "--source",
          `/w/${file}`,
        ],
      ]
    : ["java", ["-jar", jar, ...mustang, "--source", join(directory, file)]];
  const run = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: run.status, report: run.stdout ?? "", stderr: run.stderr ?? "" };
}

/** Les refus d'un rapport ; vide = le fichier passe. */
function judge({ status, report }) {
  const faults = [];
  if (status !== 0) faults.push(`Java a rendu ${String(status)}`);
  const summaries = [...report.matchAll(/<summary status="([^"]*)"/gu)].map((m) => m[1]);
  if (summaries.length === 0) faults.push("aucun <summary status=> dans le rapport");
  for (const s of summaries) if (s !== "valid") faults.push(`<summary status="${s}">`);
  for (const m of report.matchAll(/<error\b[^>]*>([\s\S]*?)<\/error>/gu)) {
    faults.push(`erreur : ${m[1].trim()}`);
  }
  for (const m of report.matchAll(/<warning\b[^>]*>([\s\S]*?)<\/warning>/gu)) {
    const id = /\[ID ([^\]]+)\]/u.exec(m[1])?.[1];
    if (id === undefined) faults.push(`avertissement sans ID : ${m[1].trim()}`);
    else if (!ALLOWED.has(id)) faults.push(`avertissement non admis ${id} : ${m[1].trim()}`);
  }
  return faults;
}

const options = parseArgs(process.argv.slice(2));
const files = readdirSync(options.directory)
  .filter((f) => f.endsWith(".pdf") || f.endsWith(".xml"))
  .sort();
if (files.length === 0) {
  process.stderr.write(`Aucun témoin dans ${options.directory} : rien n'aurait été validé.\n`);
  process.exit(1);
}
// Les rapports vont À CÔTÉ du dossier, jamais dedans : relus au tour
// suivant, ils passeraient pour des témoins.
const reports = `${options.directory}-mustang`;
mkdirSync(reports, { recursive: true });
let failed = 0;
for (const file of files) {
  const result = runMustang(options, file);
  writeFileSync(join(reports, `${basename(file)}.xml`), result.report);
  const faults = judge(result);
  if (faults.length === 0) {
    process.stdout.write(`✓ ${file}\n`);
    continue;
  }
  failed += 1;
  process.stdout.write(`✗ ${file}\n${faults.map((f) => `    ${f}`).join("\n")}\n`);
  if (result.status !== 0) process.stdout.write(`${result.stderr.slice(-4000)}\n`);
}
process.stdout.write(
  `${String(files.length - failed)}/${String(files.length)} témoins valides selon Mustang` +
    ` (avertissements admis : ${[...ALLOWED.keys()].join(", ")}).\n`,
);
process.exit(failed === 0 ? 0 : 1);
