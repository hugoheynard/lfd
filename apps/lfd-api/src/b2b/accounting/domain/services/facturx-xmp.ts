/**
 * Les **métadonnées XMP Factur-X** du PDF/A-3 (plan
 * `facture-emise.md`) : ce qui fait d'un PDF/A-3 portant
 * un XML une facture Factur-X qu'un logiciel comptable reconnaît sans ouvrir
 * la pièce jointe.
 *
 * Deux descriptions : le **schéma d'extension PDF/A** (PDF/A n'admet dans le
 * XMP que des propriétés dont le schéma est déclaré) et les quatre
 * propriétés `fx:` elles-mêmes. Écrites d'après la spécification Factur-X
 * 1.0 (de mémoire, 2026-10-08 ; non validées par veraPDF dans ce lot).
 *
 * Aucune valeur variable : le type est `INVOICE` pour une facture comme pour
 * un avoir (le XML porte 380 ou 381), et le nom du fichier joint est fixé
 * par la norme.
 */

/** Le nom que la norme impose à la pièce jointe XML. */
export const FACTURX_FILE_NAME = "factur-x.xml";

/** Le profil annoncé — celui du XML (`urn:cen.eu:en16931:2017`). */
export const FACTURX_CONFORMANCE_LEVEL = "EN 16931";

const FACTURX_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";

const PROPERTIES: readonly (readonly [name: string, description: string])[] = [
  ["DocumentFileName", "The name of the embedded XML document"],
  ["DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER"],
  ["Version", "The actual version of the standard applying to the embedded XML document"],
  ["ConformanceLevel", "The conformance level of the embedded XML document"],
];

function propertyDeclaration([name, description]: readonly [string, string]): string {
  return (
    '<rdf:li rdf:parseType="Resource">' +
    `<pdfaProperty:name>${name}</pdfaProperty:name>` +
    "<pdfaProperty:valueType>Text</pdfaProperty:valueType>" +
    "<pdfaProperty:category>external</pdfaProperty:category>" +
    `<pdfaProperty:description>${description}</pdfaProperty:description>` +
    "</rdf:li>"
  );
}

/** Les deux descriptions RDF, à verser dans le paquet XMP du document. */
export function facturXXmp(): string {
  const extension =
    '<rdf:Description rdf:about="" ' +
    'xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" ' +
    'xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" ' +
    'xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">' +
    '<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">' +
    "<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>" +
    `<pdfaSchema:namespaceURI>${FACTURX_NAMESPACE}</pdfaSchema:namespaceURI>` +
    "<pdfaSchema:prefix>fx</pdfaSchema:prefix>" +
    `<pdfaSchema:property><rdf:Seq>${PROPERTIES.map(propertyDeclaration).join("")}</rdf:Seq></pdfaSchema:property>` +
    "</rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>";
  const values =
    `<rdf:Description rdf:about="" xmlns:fx="${FACTURX_NAMESPACE}">` +
    "<fx:DocumentType>INVOICE</fx:DocumentType>" +
    `<fx:DocumentFileName>${FACTURX_FILE_NAME}</fx:DocumentFileName>` +
    "<fx:Version>1.0</fx:Version>" +
    `<fx:ConformanceLevel>${FACTURX_CONFORMANCE_LEVEL}</fx:ConformanceLevel>` +
    "</rdf:Description>";
  return `${extension}\n${values}`;
}
