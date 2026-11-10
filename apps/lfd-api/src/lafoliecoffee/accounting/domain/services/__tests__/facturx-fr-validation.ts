import { join } from "node:path";

import {
  APP_ROOT,
  compiledStylesheet,
  type SchematronFailure,
  stylesheetFailures,
} from "./en16931-schematron.js";
import { xsdValidationErrors } from "./xsd-validation.js";

/**
 * **Les artefacts officiels de la conformité française**, rejoués dans les
 * specs : le XSD Factur-X 1.09.2 du profil EN 16931, son Schematron, et le
 * Schematron BR-FR « Flux 2 » (CIUS-FR) v1.4.0.04 — tous tirés du paquet
 * FNFE-MPE `2026_09_04_FNFE_SCHEMATRONS_FR_CTC_V1.4.0.04`, commités sous
 * `test/fixtures/facturx-fr/` avec leur provenance (`README.md`).
 *
 * Le XSD passe par libxml2 en WebAssembly (`xsd-validation.ts`) : `saxon-js`
 * ne valide pas de schéma.
 * Les deux Schematrons passent par le même chemin que l'EN 16931
 * (`en16931-schematron.ts`) : compilés une fois en SEF dans un cache non suivi.
 */

const FIXTURES = join(APP_ROOT, "test", "fixtures", "facturx-fr");
const XSD_PATH = join(FIXTURES, "xsd", "Factur-X_EN16931.xsd");
const FACTURX_XSLT = join(FIXTURES, "schematron", "FACTUR-X_EN16931.xslt");
const FACTURX_CODEDB = join(FIXTURES, "schematron", "FACTUR-X_EN16931_codedb.xml");
const BR_FR_XSLT = join(FIXTURES, "schematron", "BR-FR-Flux2-Schematron-CII.xslt");

/**
 * Valide un XML contre le XSD Factur-X EN 16931 ; `[]` si le document est
 * valide.
 */
export function xsdErrors(xml: string): Promise<readonly string[]> {
  return xsdValidationErrors(xml, XSD_PATH);
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
