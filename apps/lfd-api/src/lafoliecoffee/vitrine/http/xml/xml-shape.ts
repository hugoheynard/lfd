/**
 * **La forme d'un document XML de la vitrine**, décrite UNE fois et lue par
 * deux écrivains : le sérialiseur (`writeXml`) et le schéma (`writeXsd`).
 *
 * C'est ce qui tient le XSD et la sortie ensemble (Hugo, 2026-10-18) : un
 * champ que la forme ne déclare pas fait échouer la sérialisation au lieu de
 * produire un élément que le schéma ignore, et la forme est typée contre les
 * vues du contrat (`vitrine-xml-shapes.ts`) — un champ ajouté au contrat ne
 * compile plus tant qu'il n'y est pas décrit.
 */

/** Les types simples du schéma (`xs:*`). */
export type XmlScalarType = "string" | "integer" | "decimal" | "boolean";

/** Un élément à texte simple, éventuellement restreint à des valeurs. */
export interface XmlScalarShape {
  readonly kind: "scalar";
  readonly type: XmlScalarType;
  readonly values?: readonly string[];
}

/** Un objet JSON : un élément par champ, dans n'importe quel ordre (`xs:all`). */
export interface XmlObjectShape {
  readonly kind: "object";
  readonly fields: Readonly<Record<string, XmlFieldShape>>;
}

/** Un tableau JSON : l'élément au pluriel, et ses entrées au singulier. */
export interface XmlListShape {
  readonly kind: "list";
  readonly entry: string;
  readonly of: XmlShape;
}

/**
 * Un dictionnaire JSON (`{ "product.bestSeller": "…" }`) : ses clés ne sont
 * pas des noms XML, elles passent en attribut — `<text key="…">…</text>`.
 */
export interface XmlDictionaryShape {
  readonly kind: "dictionary";
  readonly entry: string;
  readonly keyAttribute: string;
}

export type XmlShape = XmlScalarShape | XmlObjectShape | XmlListShape | XmlDictionaryShape;

/** Un champ : sa forme, et s'il peut manquer (`null` ou absent dans le JSON). */
export interface XmlFieldShape {
  readonly shape: XmlShape;
  readonly optional: boolean;
}

/**
 * Les champs d'une vue, typés contre elle : chaque clé de `T` est décrite,
 * et rien d'autre. `-?` force la description des champs optionnels aussi.
 */
export type XmlFieldsOf<T> = { readonly [K in keyof T]-?: XmlFieldShape };

export function objectOf<T>(fields: XmlFieldsOf<T>): XmlObjectShape {
  return { kind: "object", fields };
}

export const required = (shape: XmlShape): XmlFieldShape => ({ shape, optional: false });
export const optional = (shape: XmlShape): XmlFieldShape => ({ shape, optional: true });

export const xmlString: XmlScalarShape = { kind: "scalar", type: "string" };
export const xmlInteger: XmlScalarShape = { kind: "scalar", type: "integer" };
export const xmlDecimal: XmlScalarShape = { kind: "scalar", type: "decimal" };
export const xmlBoolean: XmlScalarShape = { kind: "scalar", type: "boolean" };

export function oneOf(values: readonly string[]): XmlScalarShape {
  return { kind: "scalar", type: "string", values };
}

export function listOf(entry: string, of: XmlShape): XmlListShape {
  return { kind: "list", entry, of };
}
