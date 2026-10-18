import type { XmlObjectShape, XmlScalarShape, XmlShape } from "./xml-shape.js";
import { escapeXmlText, XML_DECLARATION } from "./xml-writer.js";

const INDENT = "  ";

/**
 * **Le schéma XSD (1.0) des documents décrits par `roots`**, dérivé des
 * mêmes formes que le sérialiseur : les deux ne peuvent pas diverger.
 *
 * Sans espace de noms, comme la sortie. Un objet est un `xs:all` (l'ordre des
 * champs suit le JSON et n'est pas promis) ; un tableau, une séquence de son
 * élément singulier ; un champ qui peut être `null` ou absent, `minOccurs="0"`.
 */
export function writeXsd(roots: Readonly<Record<string, XmlObjectShape>>): string {
  const elements = Object.entries(roots).flatMap(([name, shape]) => element(name, shape, "", 1));
  return [
    XML_DECLARATION,
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="unqualified">',
    ...elements,
    "</xs:schema>",
    "",
  ].join("\n");
}

function element(name: string, shape: XmlShape, occurs: string, depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  const open = `${pad}<xs:element name="${name}"${occurs}`;
  if (shape.kind === "scalar" && shape.values === undefined) {
    return [`${open} type="xs:${shape.type}"/>`];
  }
  return [`${open}>`, ...typeOf(shape, depth + 1), `${pad}</xs:element>`];
}

function typeOf(shape: XmlShape, depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  switch (shape.kind) {
    case "scalar":
      return enumeration(shape, depth);
    case "object":
      return [
        `${pad}<xs:complexType>`,
        `${inner}<xs:all>`,
        ...Object.entries(shape.fields).flatMap(([name, field]) =>
          element(name, field.shape, field.optional ? ' minOccurs="0"' : "", depth + 2),
        ),
        `${inner}</xs:all>`,
        `${pad}</xs:complexType>`,
      ];
    case "list":
      return sequenceOf(element(shape.entry, shape.of, UNBOUNDED, depth + 2), depth);
    case "dictionary":
      return sequenceOf(
        [
          `${INDENT.repeat(depth + 2)}<xs:element name="${shape.entry}"${UNBOUNDED}>`,
          ...textWithAttribute(shape.keyAttribute, depth + 3),
          `${INDENT.repeat(depth + 2)}</xs:element>`,
        ],
        depth,
      );
  }
}

const UNBOUNDED = ' minOccurs="0" maxOccurs="unbounded"';

function sequenceOf(entry: readonly string[], depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  return [
    `${pad}<xs:complexType>`,
    `${inner}<xs:sequence>`,
    ...entry,
    `${inner}</xs:sequence>`,
    `${pad}</xs:complexType>`,
  ];
}

function enumeration(shape: XmlScalarShape, depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  return [
    `${pad}<xs:simpleType>`,
    `${inner}<xs:restriction base="xs:${shape.type}">`,
    ...(shape.values ?? []).map(
      (value) => `${inner}${INDENT}<xs:enumeration value="${escapeXmlText(value)}"/>`,
    ),
    `${inner}</xs:restriction>`,
    `${pad}</xs:simpleType>`,
  ];
}

function textWithAttribute(attribute: string, depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  return [
    `${pad}<xs:complexType>`,
    `${pad}${INDENT}<xs:simpleContent>`,
    `${pad}${INDENT.repeat(2)}<xs:extension base="xs:string">`,
    `${pad}${INDENT.repeat(3)}<xs:attribute name="${attribute}" type="xs:string" use="required"/>`,
    `${pad}${INDENT.repeat(2)}</xs:extension>`,
    `${pad}${INDENT}</xs:simpleContent>`,
    `${pad}</xs:complexType>`,
  ];
}
