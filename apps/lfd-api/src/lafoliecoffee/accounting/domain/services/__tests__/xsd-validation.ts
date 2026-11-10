import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { validateXML } from "xmllint-wasm";

/**
 * **Valide un XML contre un XSD**, par libxml2 compilé en WebAssembly
 * (`xmllint-wasm`) et non par le binaire `xmllint` du système.
 *
 * Le binaire n'est pas sur les machines de la CI : il s'y installait par
 * `apt-get`, et le 2026-10-22 les miroirs Ubuntu ont fait échouer deux CI sur
 * un délai de téléchargement, sans qu'aucun test n'ait échoué. Le paquet vit
 * dans les dépendances : rien ne se télécharge plus à côté.
 *
 * Les autres `.xsd` du dossier sont chargés avec le schéma principal, qui les
 * importe par leur nom (`schemaLocation` relatif).
 *
 * @returns les erreurs, une par entrée ; `[]` si le document est valide.
 */
export async function xsdValidationErrors(
  xml: string,
  xsdPath: string,
): Promise<readonly string[]> {
  const folder = dirname(xsdPath);
  const main = basename(xsdPath);
  const imported = readdirSync(folder)
    .filter((name) => name.endsWith(".xsd") && name !== main)
    .map((name) => ({ fileName: name, contents: readFileSync(join(folder, name), "utf8") }));
  const result = await validateXML({
    xml: { fileName: "document.xml", contents: xml },
    schema: { fileName: main, contents: readFileSync(xsdPath, "utf8") },
    preload: imported,
  });
  return result.valid ? [] : result.errors.map((error) => error.rawMessage);
}
