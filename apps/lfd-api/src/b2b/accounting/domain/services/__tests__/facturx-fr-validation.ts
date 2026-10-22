import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  APP_ROOT,
  compiledStylesheet,
  type SchematronFailure,
  stylesheetFailures,
} from "./en16931-schematron.js";

/**
 * **Les artefacts officiels de la conformité française**, rejoués dans les
 * specs : le XSD Factur-X 1.09.2 du profil EN 16931, son Schematron, et le
 * Schematron BR-FR « Flux 2 » (CIUS-FR) v1.4.0.04 — tous tirés du paquet
 * FNFE-MPE `2026_09_04_FNFE_SCHEMATRONS_FR_CTC_V1.4.0.04`, commités sous
 * `test/fixtures/facturx-fr/` avec leur provenance (`README.md`).
 *
 * Le XSD passe par `xmllint` (libxml2) : `saxon-js` ne valide pas de schéma.
 * Les deux Schematrons passent par le même chemin que l'EN 16931
 * (`en16931-schematron.ts`) : compilés une fois en SEF dans un cache non suivi.
 */

const FIXTURES = join(APP_ROOT, "test", "fixtures", "facturx-fr");
const XSD_PATH = join(FIXTURES, "xsd", "Factur-X_EN16931.xsd");
const FACTURX_XSLT = join(FIXTURES, "schematron", "FACTUR-X_EN16931.xslt");
const FACTURX_CODEDB = join(FIXTURES, "schematron", "FACTUR-X_EN16931_codedb.xml");
const BR_FR_XSLT = join(FIXTURES, "schematron", "BR-FR-Flux2-Schematron-CII.xslt");

/** Ce qu'un `xmllint` absent rend à `spawnSync` : le message dit quoi installer. */
const MISSING_BINARY = "ENOENT";

/**
 * Valide un XML contre le XSD Factur-X EN 16931 et rend les erreurs de
 * `xmllint`, une par ligne ; `[]` si le document est valide.
 */
export function xsdErrors(xml: string): readonly string[] {
  const run = spawnSync("xmllint", ["--noout", "--schema", XSD_PATH, "-"], {
    input: xml,
    encoding: "utf8",
  });
  if (run.error !== undefined) {
    const missing = "code" in run.error && run.error.code === MISSING_BINARY;
    throw new Error(
      missing
        ? "xmllint est introuvable : installer libxml2 (apt `libxml2-utils`, livré avec macOS)."
        : `xmllint n'a pas pu tourner : ${run.error.message}`,
    );
  }
  if (run.status === 0) {
    return [];
  }
  return run.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith("fails to validate"));
}

/** Compile les deux Schematrons français s'il le faut (appel de `beforeAll`). */
export function compileFrenchSchematrons(): void {
  facturXSef();
  brFrSef();
}

/** Le Schematron Factur-X 1.09.2 EN 16931 (structure du profil + EN 16931). */
export function facturXFailures(xml: string): readonly SchematronFailure[] {
  return stylesheetFailures(facturXSef(), xml);
}

/** Le Schematron BR-FR Flux 2, mode `fatal` (émission depuis le 2026-10-01). */
export function brFrFailures(xml: string): readonly SchematronFailure[] {
  return stylesheetFailures(brFrSef(), xml);
}

/**
 * Les refus : tout ce qui n'est pas marqué `warning`. Le Schematron
 * Factur-X n'annote pas toutes ses règles d'un `flag` — une règle sans
 * drapeau est une erreur, pas un avertissement.
 */
export function refusals(failures: readonly SchematronFailure[]): readonly string[] {
  return [...new Set(failures.filter((f) => f.flag !== "warning").map((f) => f.id))].sort();
}

/** Les identifiants des avertissements, dédoublonnés et triés. */
export function warnings(failures: readonly SchematronFailure[]): readonly string[] {
  return [...new Set(failures.filter((f) => f.flag === "warning").map((f) => f.id))].sort();
}

function facturXSef(): string {
  return compiledStylesheet(FACTURX_XSLT, "facturx-fr-en16931", [FACTURX_CODEDB]);
}

function brFrSef(): string {
  return compiledStylesheet(BR_FR_XSLT, "facturx-fr-br-fr");
}
