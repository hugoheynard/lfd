import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compiledSchematron,
  fatalFailures,
  schematronFailures,
  SCHEMATRON_COMPILE_TIMEOUT_MS,
} from "./en16931-schematron.js";
import { renderFacturXml } from "../facturx-xml.js";
import { facturXSamples } from "./facturx-samples.js";

/**
 * **Le XML Factur-X passé au Schematron EN 16931 officiel** (CII,
 * ConnectingEurope `validation-1.3.16`) : chaque forme de pièce que
 * l'émission produit doit en sortir sans aucune règle `fatal`. Les deux
 * témoins prouvent que le validateur ne rend pas vide par accident.
 *
 * Avertissements (`warning`) : aucun sur les six pièces au 2026-10-09 ; la
 * spec les exige à zéro pour qu'un nouvel avertissement soit lu, pas subi.
 */

const OFFICIAL_EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  ...Array.from({ length: 6 }, () => ".."),
  "test",
  "fixtures",
  "en16931-cii",
  "CII_example1.xml",
);

beforeAll(() => {
  compiledSchematron();
}, SCHEMATRON_COMPILE_TIMEOUT_MS);

describe("Schematron EN 16931 — les témoins du validateur", () => {
  it("accepte l'exemple officiel CII_example1 sans aucune règle enfreinte", () => {
    expect(schematronFailures(readFileSync(OFFICIAL_EXAMPLE, "utf8"))).toEqual([]);
  });

  it("refuse un total TTC falsifié (BR-CO-15) : il lit vraiment le document", () => {
    const sample = facturXSamples()[0];
    if (sample === undefined) {
      throw new Error("aucune pièce témoin");
    }
    const xml = renderFacturXml(sample.invoice);
    const grandTotal = /<ram:GrandTotalAmount>([^<]+)<\/ram:GrandTotalAmount>/u.exec(xml)?.[0];
    expect(grandTotal).toBeDefined();
    const tampered = xml.replace(
      grandTotal ?? "",
      "<ram:GrandTotalAmount>999.99</ram:GrandTotalAmount>",
    );
    expect(fatalFailures(tampered).map((failure) => failure.id)).toContain("BR-CO-15");
  });
});

describe("Schematron EN 16931 — les pièces émises", () => {
  it.each(facturXSamples().map((sample) => [sample.name, sample.invoice] as const))(
    "%s : aucune règle enfreinte, ni fatale ni avertissement",
    (_name, invoice) => {
      expect(schematronFailures(renderFacturXml(invoice))).toEqual([]);
    },
  );
});
