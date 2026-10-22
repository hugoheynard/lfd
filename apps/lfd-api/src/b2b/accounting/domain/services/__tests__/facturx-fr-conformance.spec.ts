import { readFileSync } from "node:fs";
import { join } from "node:path";

import { APP_ROOT, SCHEMATRON_COMPILE_TIMEOUT_MS } from "./en16931-schematron.js";
import {
  brFrFailures,
  compileFrenchSchematrons,
  facturXFailures,
  refusals,
  warnings,
  xsdErrors,
} from "./facturx-fr-validation.js";
import { facturXSamples } from "./facturx-samples.js";
import { renderFacturXml } from "../facturx-xml.js";

/**
 * **La conformité française du XML Factur-X émis** — profil EN 16931 avec
 * CIUS-FR (XP Z12-012 v1.4), contre les artefacts officiels FNFE-MPE
 * (`test/fixtures/facturx-fr/README.md`) : le XSD Factur-X 1.09.2, son
 * Schematron, et le Schematron BR-FR Flux 2 v1.4.0.04.
 *
 * Les règles BR-FR que nos pièces enfreignent encore faute de DONNÉE sont
 * listées ici, une par une, avec ce qui manque : une règle qui se met à
 * passer fait rougir la spec autant qu'une nouvelle faute — la liste ne peut
 * que se vider, et chaque retrait se lit (2026-10-22).
 */

const OFFICIAL_EXAMPLE = join(APP_ROOT, "test", "fixtures", "en16931-cii", "CII_example1.xml");

/**
 * Les manques connus au 2026-10-22, pour TOUTE pièce émise.
 * - BR-FR-13 / BT-34 : l'adresse électronique de réception du VENDEUR,
 *   celle que notre plateforme agréée nous attribuera à l'annuaire — nous
 *   n'en avons pas encore choisi.
 * - BR-FR-12 / BT-49 : l'adresse électronique de l'ACHETEUR, lue à
 *   l'annuaire de la réforme (forme `SIREN` ou `SIREN_xxx`, schéma 0225) —
 *   aucun lecteur de l'annuaire n'existe ; la deviner adresserait la
 *   facture au mauvais endroit.
 */
const KNOWN_GAPS = ["BR-FR-12_BT-49", "BR-FR-13_BT-34"] as const;

/**
 * En plus, pour l'avoir — BR-FR-CO-05 / BT-26 : la DATE de la facture
 * corrigée. L'avoir ne fige que son numéro (BT-25) ; la date existe sur la
 * facture d'origine mais n'est pas figée sur l'avoir.
 */
const CREDIT_NOTE_GAPS = ["BR-FR-CO-05_BT-3"] as const;

/**
 * PEPPOL-EN16931-R008, avertissement : `ApplicableHeaderTradeDelivery` est
 * vide quand la pièce n'a ni lieu de livraison distinct ni date de livraison
 * unique — et le XSD l'exige quand même. Rien à y écrire sans inventer.
 */
const EMPTY_DELIVERY_WARNING = "PEPPOL-EN16931-R008";

function expectedBrFrGaps(name: string): readonly string[] {
  return [...KNOWN_GAPS, ...(name === "avoir-partiel" ? CREDIT_NOTE_GAPS : [])].sort();
}

const samples = facturXSamples().map((sample) => [sample.name, sample.invoice] as const);

beforeAll(() => {
  compileFrenchSchematrons();
}, SCHEMATRON_COMPILE_TIMEOUT_MS * 2);

describe("XSD Factur-X 1.09.2 EN 16931", () => {
  it("accepte l'exemple officiel CII_example1 (témoin du validateur)", () => {
    expect(xsdErrors(readFileSync(OFFICIAL_EXAMPLE, "utf8"))).toEqual([]);
  });

  it("refuse un élément hors de sa séquence : il lit vraiment l'ordre", () => {
    const xml = renderFacturXml(samples[0]?.[1] ?? fail("aucune pièce témoin"));
    const swapped = xml.replace(
      /(<ram:TypeCode>380<\/ram:TypeCode>)(<ram:IssueDateTime>.*?<\/ram:IssueDateTime>)/u,
      "$2$1",
    );
    expect(swapped).not.toEqual(xml);
    expect(xsdErrors(swapped)).not.toEqual([]);
  });

  it.each(samples)("%s : valide contre le schéma", (_name, invoice) => {
    expect(xsdErrors(renderFacturXml(invoice))).toEqual([]);
  });
});

describe("Schematron Factur-X 1.09.2 EN 16931", () => {
  it.each(samples)("%s : aucun refus ; seul l'avertissement de livraison vide", (_n, invoice) => {
    const failures = facturXFailures(renderFacturXml(invoice));
    expect(refusals(failures)).toEqual([]);
    expect(warnings(failures).filter((id) => id !== EMPTY_DELIVERY_WARNING)).toEqual([]);
  });
});

describe("Schematron BR-FR Flux 2 (CIUS-FR)", () => {
  it("refuse une mention légale retirée (BR-FR-05, PMD) : il lit vraiment les notes", () => {
    const xml = renderFacturXml(samples[0]?.[1] ?? fail("aucune pièce témoin"));
    const stripped = xml.replace("<ram:SubjectCode>PMD</ram:SubjectCode>", "");
    expect(refusals(brFrFailures(stripped))).toContain("BR-FR-05_BT-22_PMD");
  });

  it.each(samples)(
    "%s : seuls les manques de donnée connus, aucun autre refus",
    (name, invoice) => {
      const failures = brFrFailures(renderFacturXml(invoice));
      expect(refusals(failures)).toEqual(expectedBrFrGaps(name));
      expect(warnings(failures)).toEqual([]);
    },
  );
});

function fail(message: string): never {
  throw new Error(message);
}
