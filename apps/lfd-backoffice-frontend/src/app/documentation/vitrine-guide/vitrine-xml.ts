/**
 * **Le XML de la vitrine, pour l'exemple du guide** — le serveur le sert
 * depuis le 2026-10-18 (`apps/lfd-api/src/b2b/vitrine/http/xml/`).
 *
 * Écrit pour que l'exemple XML du guide de l'agence soit DÉRIVÉ de l'exemple
 * JSON plutôt que recopié à la main. Les règles sont celles que Hugo a fixées
 * le 2026-10-18, et celles du sérialiseur du serveur :
 *
 * - un élément par champ, nommé exactement comme le champ JSON (camelCase) ;
 * - un tableau devient un élément au pluriel qui contient des éléments au
 *   singulier (`items` → `item`) ;
 * - une valeur `null` ou absente ne produit aucun élément ;
 * - échappement des cinq caractères réservés, retrait de ceux qu'XML 1.0
 *   interdit.
 *
 * C'est la sortie du SERVEUR qui fait foi : sa spec
 * (`http/xml/__tests__/vitrine-xml.spec.ts`) rend le même article que
 * `SAMPLE_ITEM` et le compare au même texte que celle de ce fichier — si l'un
 * des deux sérialiseurs dérive, une des deux suites rougit.
 */

/**
 * `unknown` plutôt qu'un type JSON récursif : les vues du contrat sont des
 * interfaces, sans signature d'index, et ne s'y affecteraient pas.
 */
export type VitrineJson = unknown;

/** Les tableaux du contrat, et le nom de leurs éléments. */
const SINGULAR_OF: Readonly<Record<string, string>> = {
  items: 'item',
  shelves: 'shelf',
  operations: 'operation',
  skus: 'sku',
};

const INDENT = '  ';

/**
 * @throws {Error} un tableau dont le singulier n'est pas déclaré — l'exemple
 *   inventerait sinon un nom d'élément que le serveur ne promet pas.
 */
export function toVitrineXml(root: string, value: VitrineJson): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${element(root, value, 0).join('\n')}\n`;
}

function element(name: string, value: VitrineJson, depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  if (value === null || value === undefined) {
    return [];
  }
  if (isArray(value)) {
    const singular = SINGULAR_OF[name];
    if (singular === undefined) {
      throw new Error(`Tableau « ${name} » sans nom d'élément singulier déclaré.`);
    }
    return wrap(
      name,
      pad,
      value.flatMap((entry) => element(singular, entry, depth + 1)),
    );
  }
  if (typeof value === 'object') {
    return wrap(
      name,
      pad,
      Object.entries(value as object).flatMap(([key, entry]) => element(key, entry, depth + 1)),
    );
  }
  return [`${pad}<${name}>${escapeXml(scalar(value))}</${name}>`];
}

function wrap(name: string, pad: string, children: readonly string[]): readonly string[] {
  return children.length === 0
    ? [`${pad}<${name}/>`]
    : [`${pad}<${name}>`, ...children, `${pad}</${name}>`];
}

function isArray(value: VitrineJson): value is readonly VitrineJson[] {
  return Array.isArray(value);
}

function scalar(value: VitrineJson): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

/** Ce qu'XML 1.0 admet : tabulation, sauts de ligne, et tout hors contrôles et U+FFFE/U+FFFF. */
function isXmlChar(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x20) {
    return code === 0x09 || code === 0x0a || code === 0x0d;
  }
  return !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff;
}

function escapeXml(text: string): string {
  return [...text]
    .filter(isXmlChar)
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
