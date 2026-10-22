import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { APP_ROOT } from "./en16931-schematron.js";

/**
 * **Le schéma ISO 20022 `pain.008.001.02`**, recopié tel quel sous
 * `test/fixtures/pain008/` avec sa provenance (`README.md`). Passé par
 * `xmllint` (libxml2), comme le XSD Factur-X (`facturx-fr-validation.ts`).
 */
const XSD_PATH = join(APP_ROOT, "test", "fixtures", "pain008", "pain.008.001.02.xsd");

/** Ce qu'un `xmllint` absent rend à `spawnSync`. */
const MISSING_BINARY = "ENOENT";

/** Les erreurs de `xmllint`, une par ligne ; `[]` si le message est valide. */
export function pain008XsdErrors(xml: string): readonly string[] {
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
