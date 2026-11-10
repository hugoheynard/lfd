import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { XmlDictionaryShape, XmlObjectShape, XmlScalarShape, XmlShape } from "./xml-shape.js";

const INDENT = "  ";

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Une vue qui ne correspond pas à sa forme XML : un champ que le schéma ne
 * déclare pas, un obligatoire absent, une valeur du mauvais type. Une faute
 * de NOTRE code — la sortie serait invalide contre le XSD servi.
 */
export class VitrineXmlShapeMismatchError extends TechnicalError {
  constructor(path: string, problem: string) {
    super(
      "vitrine.xml.shape_mismatch",
      `La vue de la vitrine ne correspond pas à son schéma XML (${path} : ${problem}) : ` +
        `décrire le champ dans vitrine-xml-shapes.ts, le JSON reste servi.`,
    );
  }
}

/**
 * **Sérialise une vue JSON en XML**, selon sa forme (Hugo, 2026-10-18).
 *
 * Les champs sortent dans l'ordre du JSON (le schéma dit `xs:all`) ; `null` et
 * absent ne produisent aucun élément ; un tableau vide reste un élément vide,
 * comme il reste `[]` dans le JSON.
 *
 * @throws {VitrineXmlShapeMismatchError}
 */
export function writeXml(root: string, shape: XmlObjectShape, value: unknown): string {
  return `${XML_DECLARATION}\n${node(root, shape, value, root, 0).join("\n")}\n`;
}

function node(
  name: string,
  shape: XmlShape,
  value: unknown,
  path: string,
  depth: number,
): readonly string[] {
  const pad = INDENT.repeat(depth);
  switch (shape.kind) {
    case "scalar":
      return [`${pad}<${name}>${escapeXmlText(scalarText(shape, value, path))}</${name}>`];
    case "object":
      return wrap(name, pad, objectChildren(shape, value, path, depth + 1));
    case "list":
      return wrap(
        name,
        pad,
        arrayOf(value, path).flatMap((entry, index) =>
          node(shape.entry, shape.of, entry, `${path}[${String(index)}]`, depth + 1),
        ),
      );
    case "dictionary":
      return wrap(name, pad, dictionaryChildren(shape, value, path, depth + 1));
  }
}

function objectChildren(
  shape: XmlObjectShape,
  value: unknown,
  path: string,
  depth: number,
): readonly string[] {
  const record = recordOf(value, path);
  for (const [key, field] of Object.entries(shape.fields)) {
    if (!field.optional && (record[key] === undefined || record[key] === null)) {
      throw new VitrineXmlShapeMismatchError(`${path}.${key}`, "obligatoire et absent");
    }
  }
  return Object.entries(record).flatMap(([key, entry]) => {
    const field = shape.fields[key];
    if (field === undefined) {
      throw new VitrineXmlShapeMismatchError(`${path}.${key}`, "champ non déclaré");
    }
    return entry === null || entry === undefined
      ? []
      : node(key, field.shape, entry, `${path}.${key}`, depth);
  });
}

function dictionaryChildren(
  shape: XmlDictionaryShape,
  value: unknown,
  path: string,
  depth: number,
): readonly string[] {
  const pad = INDENT.repeat(depth);
  return Object.entries(recordOf(value, path)).map(([key, entry]) => {
    if (typeof entry !== "string") {
      throw new VitrineXmlShapeMismatchError(`${path}.${key}`, "texte attendu");
    }
    const attribute = `${shape.keyAttribute}="${escapeXmlText(key)}"`;
    return `${pad}<${shape.entry} ${attribute}>${escapeXmlText(entry)}</${shape.entry}>`;
  });
}

function wrap(name: string, pad: string, children: readonly string[]): readonly string[] {
  return children.length === 0
    ? [`${pad}<${name}/>`]
    : [`${pad}<${name}>`, ...children, `${pad}</${name}>`];
}

function scalarText(shape: XmlScalarShape, value: unknown, path: string): string {
  switch (shape.type) {
    case "string":
      if (typeof value !== "string" || (shape.values && !shape.values.includes(value))) {
        throw new VitrineXmlShapeMismatchError(path, "texte attendu, ou valeur hors liste");
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new VitrineXmlShapeMismatchError(path, "booléen attendu");
      }
      return String(value);
    case "integer":
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new VitrineXmlShapeMismatchError(path, "entier attendu");
      }
      return String(value);
    case "decimal":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new VitrineXmlShapeMismatchError(path, "nombre attendu");
      }
      return decimalText(value);
  }
}

/** `xs:decimal` n'admet pas l'exposant que `String(1e-7)` écrirait. */
function decimalText(value: number): string {
  const plain = String(value);
  return /e/i.test(plain) ? value.toFixed(20).replace(/\.?0+$/, "") : plain;
}

function recordOf(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new VitrineXmlShapeMismatchError(path, "objet attendu");
  }
  return Object.fromEntries(Object.entries(value));
}

function arrayOf(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new VitrineXmlShapeMismatchError(path, "tableau attendu");
  }
  return value.map((entry: unknown) => entry);
}

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const FIRST_PRINTABLE = 0x20;
const SURROGATES_FROM = 0xd800;
const SURROGATES_TO = 0xdfff;
const NON_CHARACTERS = new Set([0xfffe, 0xffff]);

/**
 * Ce qu'XML 1.0 ADMET (§2.2) : tabulation, sauts de ligne, et tout le reste
 * hors contrôles C0, demi-paires de substitution orphelines (une chaîne JS
 * peut en porter, `for…of` les rend seules) et `U+FFFE`/`U+FFFF`.
 */
function isXmlChar(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code < FIRST_PRINTABLE) {
    return code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN;
  }
  return !(code >= SURROGATES_FROM && code <= SURROGATES_TO) && !NON_CHARACTERS.has(code);
}

/**
 * Échappe un texte pour un contenu OU un attribut entre guillemets.
 *
 * Décision (2026-10-18) : un caractère interdit en XML 1.0 est **retiré**, pas
 * refusé. Il ne vient que d'une saisie (un nom collé depuis un traitement de
 * texte) ; le refuser mettrait toute la lecture de l'agence en erreur pour un
 * caractère invisible, et aucun lecteur XML ne pourrait de toute façon le lire.
 */
export function escapeXmlText(text: string): string {
  return [...text]
    .filter(isXmlChar)
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
