import { InvalidBankReturnFileError } from "../errors/bank-return-file-errors.js";

/**
 * Un élément XML lu : son nom LOCAL (préfixe d'espace de noms ôté), ses
 * enfants, son texte. Les attributs ne sont gardés que pour `Ccy` — c'est le
 * seul que les fichiers de retour portent et qu'on lise.
 */
export interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

interface MutableElement {
  readonly name: string;
  readonly attributes: Map<string, string>;
  readonly children: MutableElement[];
  text: string;
}

const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/u;
const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/gu;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * **Un lecteur XML minimal et strict** — le dépôt n'en a aucun, et un fichier
 * de la banque ne justifie pas une dépendance (plan
 * `retours-bancaires.md`). Il lit des éléments, du texte, des
 * attributs, des sections CDATA et les cinq entités de base.
 *
 * Il REFUSE ce dont un relevé bancaire n'a pas besoin et qui ouvre une
 * attaque : toute déclaration `<!DOCTYPE` (entités externes, expansion), et
 * toute entité inconnue. Une balise mal fermée refuse le fichier entier :
 * un relevé à moitié lu se lirait faux.
 *
 * @throws {InvalidBankReturnFileError}
 */
export function parseXml(source: string): XmlElement {
  if (/<!DOCTYPE/iu.test(source)) {
    throw new InvalidBankReturnFileError("une déclaration DOCTYPE n'est pas admise");
  }
  const stack: MutableElement[] = [];
  const found: { root: MutableElement | null } = { root: null };
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    const text = source.slice(cursor, open === -1 ? source.length : open);
    appendText(stack, text, false);
    if (open === -1) {
      break;
    }
    cursor = readMarkup(source, open, stack, (element) => {
      if (found.root !== null) {
        throw new InvalidBankReturnFileError("plusieurs éléments racines");
      }
      found.root = element;
    });
  }
  if (stack.length > 0) {
    throw new InvalidBankReturnFileError(
      `la balise <${stack.at(-1)?.name ?? "?"}> n'est pas fermée`,
    );
  }
  if (found.root === null) {
    throw new InvalidBankReturnFileError("aucun élément XML");
  }
  return found.root;
}

/** Lit la balise qui commence à `open` ; rend la position qui suit. */
function readMarkup(
  source: string,
  open: number,
  stack: MutableElement[],
  onRoot: (element: MutableElement) => void,
): number {
  if (source.startsWith("<?", open)) {
    return after(source, "?>", open);
  }
  if (source.startsWith("<!--", open)) {
    return after(source, "-->", open);
  }
  if (source.startsWith("<![CDATA[", open)) {
    const end = after(source, "]]>", open);
    appendText(stack, source.slice(open + "<![CDATA[".length, end - "]]>".length), true);
    return end;
  }
  const end = after(source, ">", open);
  const body = source.slice(open + 1, end - 1).trim();
  if (body.startsWith("/")) {
    closeElement(stack, localName(body.slice(1).trim()));
    return end;
  }
  const selfClosing = body.endsWith("/");
  const element = openElement(selfClosing ? body.slice(0, -1).trim() : body);
  const parent = stack.at(-1);
  if (parent === undefined) {
    onRoot(element);
  } else {
    parent.children.push(element);
  }
  if (!selfClosing) {
    stack.push(element);
  }
  return end;
}

function openElement(body: string): MutableElement {
  const space = body.search(/\s/u);
  const rawName = space === -1 ? body : body.slice(0, space);
  if (!NAME.test(rawName)) {
    throw new InvalidBankReturnFileError(`nom de balise illisible « ${rawName.slice(0, 40)} »`);
  }
  const attributes = new Map<string, string>();
  for (const match of (space === -1 ? "" : body.slice(space)).matchAll(ATTRIBUTE)) {
    attributes.set(localName(match[1] ?? ""), decode(match[2] ?? match[3] ?? ""));
  }
  return { name: localName(rawName), attributes, children: [], text: "" };
}

function closeElement(stack: MutableElement[], name: string): void {
  const current = stack.pop();
  if (current?.name !== name) {
    throw new InvalidBankReturnFileError(
      `</${name}> ferme <${current?.name ?? "rien"}> : le fichier est mal formé`,
    );
  }
}

function appendText(stack: MutableElement[], raw: string, cdata: boolean): void {
  const current = stack.at(-1);
  if (current === undefined) {
    if (raw.trim() !== "") {
      throw new InvalidBankReturnFileError("du texte hors de l'élément racine");
    }
    return;
  }
  current.text += cdata ? raw : decode(raw);
}

function after(source: string, marker: string, from: number): number {
  const at = source.indexOf(marker, from);
  if (at === -1) {
    throw new InvalidBankReturnFileError(`« ${marker} » attendu, fin du fichier atteinte`);
  }
  return at + marker.length;
}

function localName(qualified: string): string {
  const colon = qualified.indexOf(":");
  return colon === -1 ? qualified : qualified.slice(colon + 1);
}

function decode(raw: string): string {
  if (/&(?!#x[0-9a-fA-F]+;|#\d+;|amp;|lt;|gt;|quot;|apos;)/u.test(raw)) {
    throw new InvalidBankReturnFileError("une entité XML inconnue");
  }
  return raw.replace(ENTITY, (_, entity: string) => {
    if (entity.startsWith("#x")) {
      return codePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return codePoint(Number.parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity] ?? "";
  });
}

const MAX_CODE_POINT = 0x10ffff;

function codePoint(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > MAX_CODE_POINT) {
    throw new InvalidBankReturnFileError("un caractère numérique hors d'Unicode");
  }
  return String.fromCodePoint(value);
}

/** Les enfants directs nommés `name`. */
export function childrenNamed(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** Le premier élément au bout d'un chemin d'enfants directs, ou `null`. */
export function at(element: XmlElement, ...path: readonly string[]): XmlElement | null {
  let current: XmlElement | null = element;
  for (const name of path) {
    current = current?.children.find((child) => child.name === name) ?? null;
  }
  return current;
}

/** Le texte, débarrassé de ses blancs, au bout d'un chemin ; `null` s'il manque ou est vide. */
export function textAt(element: XmlElement, ...path: readonly string[]): string | null {
  const found = at(element, ...path);
  const text = found?.text.trim() ?? "";
  return text === "" ? null : text;
}
