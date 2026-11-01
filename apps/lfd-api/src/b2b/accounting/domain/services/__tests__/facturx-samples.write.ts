import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { renderFacturXml } from "../facturx-xml.js";
import { renderInvoicePdf } from "../invoice-pdf.js";
import { facturXSamples } from "./facturx-samples.js";
import { TEST_FONTS } from "./invoice-fonts-fixture.js";

/**
 * **Écrit les pièces témoins Factur-X sur disque** — `pnpm --filter lfd-api
 * facturx:samples <dossier>`. Pour chaque cas de `facturx-samples.ts`, le XML
 * CII rendu par le VRAI générateur (`renderFacturXml`) et le PDF/A-3 qui
 * l'embarque (`renderInvoicePdf`, vraies polices, sans logo). Rien n'est
 * recopié : un témoin qui dérive du générateur n'éprouverait plus rien.
 *
 * Lu par le job CI `facturx-mustang` (`dev-toolbox/ci/facturx-mustang.mjs`),
 * qui passe chaque fichier au validateur tiers Mustang.
 */
async function main(): Promise<number> {
  const target = process.argv[2];
  if (target === undefined) {
    process.stderr.write("Usage : facturx:samples <dossier de sortie>\n");
    return 2;
  }
  const directory = resolve(target);
  mkdirSync(directory, { recursive: true });
  const samples = facturXSamples();
  for (const { name, invoice } of samples) {
    const xml = renderFacturXml(invoice);
    const pdf = await renderInvoicePdf({ invoice, xml, fonts: TEST_FONTS, logo: null });
    writeFileSync(join(directory, `${name}.xml`), xml, "utf8");
    writeFileSync(join(directory, `${name}.pdf`), pdf);
  }
  process.stdout.write(`${String(samples.length)} témoins (XML + PDF) écrits dans ${directory}.\n`);
  return 0;
}

process.exitCode = await main();
