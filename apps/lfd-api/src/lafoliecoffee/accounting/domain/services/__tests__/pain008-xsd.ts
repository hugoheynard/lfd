import { join } from "node:path";

import { APP_ROOT } from "./en16931-schematron.js";
import { xsdValidationErrors } from "./xsd-validation.js";

/**
 * **Le schéma ISO 20022 `pain.008.001.02`**, recopié tel quel sous
 * `test/fixtures/pain008/` avec sa provenance (`README.md`). Passé par
 * libxml2 en WebAssembly (`xsd-validation.ts`), comme le XSD Factur-X.
 */
const XSD_PATH = join(APP_ROOT, "test", "fixtures", "pain008", "pain.008.001.02.xsd");

/** Les erreurs de validation, une par entrée ; `[]` si le message est valide. */
export function pain008XsdErrors(xml: string): Promise<readonly string[]> {
  return xsdValidationErrors(xml, XSD_PATH);
}
