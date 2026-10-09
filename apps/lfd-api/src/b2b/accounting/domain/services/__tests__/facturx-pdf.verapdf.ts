import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFacturXml } from "../facturx-xml.js";
import { renderInvoicePdf } from "../invoice-pdf.js";
import { facturXSamples } from "./facturx-samples.js";
import { TEST_FONTS } from "./invoice-fonts-fixture.js";

/**
 * **veraPDF sur le PDF/A-3b Factur-X** — `pnpm --filter lfd-api
 * verify:facturx-pdf`. Hors Jest, parce que la CI n'a pas forcément Docker :
 * rend les pièces témoins de `facturx-samples.ts` (sans base, avec les vraies
 * polices), puis passe le dossier à l'image figée `verapdf/cli:v1.30.2` en
 * profil PDF/A-3B. Code de sortie non nul dès qu'un fichier n'est pas déclaré
 * conforme, ou que veraPDF n'a pas pu tourner.
 *
 * veraPDF ne juge que PDF/A : ni le XML joint, ni les propriétés XMP
 * Factur-X (`fx:`) au-delà de leur schéma d'extension déclaré.
 */

const VERAPDF_IMAGE = "verapdf/cli:v1.30.2";
/** Un rendu par cas, une ligne `PASS`/`FAIL` par fichier dans le rapport texte. */
const VERDICT = /^(PASS|FAIL) (\S+\.pdf)/gmu;

/**
 * Le logo du semis (`assets/`) : une image réelle, pour que l'objet image
 * passe aussi devant veraPDF. En production, il est déposé par entité.
 */
const SEED_LOGO = join(
  dirname(fileURLToPath(import.meta.url)),
  ...Array.from({ length: 6 }, () => ".."),
  "assets",
  "logo-la-folie-coffee-noir-et-blanc.png",
);

async function renderSamples(directory: string): Promise<readonly string[]> {
  const samples = facturXSamples();
  const withLogo = samples.slice(0, 1).map((sample) => ({
    ...sample,
    name: `${sample.name}-avec-logo`,
    logo: readFileSync(SEED_LOGO),
  }));
  const names: string[] = [];
  for (const { name, invoice, logo } of [
    ...samples.map((sample) => ({ ...sample, logo: null })),
    ...withLogo,
  ]) {
    const xml = renderFacturXml(invoice);
    const pdf = await renderInvoicePdf({ invoice, xml, fonts: TEST_FONTS, logo });
    writeFileSync(join(directory, `${name}.pdf`), pdf);
    names.push(`${name}.pdf`);
  }
  return names;
}

function runVeraPdf(directory: string): {
  readonly status: number | null;
  readonly report: string;
} {
  const run = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "-v",
      `${directory}:/data`,
      VERAPDF_IMAGE,
      "--flavour",
      "3b",
      "--format",
      "text",
      "--verbose",
      "/data",
    ],
    { encoding: "utf8" },
  );
  return { status: run.status, report: `${run.stdout}${run.stderr}` };
}

async function main(): Promise<number> {
  const directory = mkdtempSync(join(tmpdir(), "facturx-pdf-"));
  const files = await renderSamples(directory);
  const { status, report } = runVeraPdf(directory);
  process.stdout.write(`${report}\n`);
  const verdicts = new Map(
    [...report.matchAll(VERDICT)].map((match) => [match[2]?.split("/").at(-1), match[1]]),
  );
  const failed = files.filter((file) => verdicts.get(file) !== "PASS");
  if (failed.length > 0 || status === null) {
    process.stderr.write(
      `veraPDF (${VERAPDF_IMAGE}) ne déclare pas PDF/A-3B : ${failed.join(", ")} — rapport ci-dessus, fichiers dans ${directory}.\n`,
    );
    return 1;
  }
  process.stdout.write(`${String(files.length)} PDF conformes PDF/A-3B (${VERAPDF_IMAGE}).\n`);
  return 0;
}

process.exitCode = await main();
