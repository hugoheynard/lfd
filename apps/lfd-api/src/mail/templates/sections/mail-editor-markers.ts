import { htmlEscape } from "@lfd/mailer";

import { TEXT_MARKER } from "./mail-text-markers.js";

/**
 * **Les marqueurs de l'aperçu de l'éditeur par blocs** (plan
 * `plan-editeur-par-blocs.md`, § 22, S5f).
 *
 * Même mécanique que les repères de l'écran des textes
 * (`mail-text-markers.ts`, qu'elle réutilise pour les phrases) : des
 * caractères de la zone d'usage privé Unicode traversent `fill`,
 * l'échappement et l'assainissement de l'objet sans être touchés, puis
 * deviennent des balises là où c'est du TEXTE, et disparaissent là où c'est
 * un attribut. En plus des phrases, l'éditeur marque les VARIABLES :
 * `fill` entoure chaque valeur placée de son repère, dans ce mode seulement.
 *
 * Forme rendue :
 * - une phrase : `<span data-phrase="<chemin>" data-variant="<variante>">…</span>`
 *   (`data-variant` absent quand la phrase n'a pas d'alternative) ;
 * - une variable : `<span data-var="<nom>">valeur</span>`.
 *
 * Une phrase d'un AUTRE e-mail que celui rendu n'est pas marquée : l'éditeur
 * ouvert ne l'écrit pas.
 */

const PHRASE_START = TEXT_MARKER.start;
const PHRASE_SEPARATOR = TEXT_MARKER.separator;
const PHRASE_END = TEXT_MARKER.end;
const VARIABLE_START = "\uE003";
const VARIABLE_SEPARATOR = "\uE004";
const VARIABLE_END = "\uE005";

/** Une valeur placée dans une phrase, marquée du nom de sa variable. */
export function markVariable(name: string, value: string): string {
  return `${VARIABLE_START}${name}${VARIABLE_SEPARATOR}${value}${VARIABLE_END}`;
}

/** Ôte tous les repères de l'éditeur — phrases et variables. */
export function stripEditorMarkers(text: string): string {
  return text
    .replace(/[\uE000\uE003][^\uE001\uE004]*[\uE001\uE004]/gu, "")
    .replace(/[\uE002\uE005]/gu, "");
}

/** Ce que la révélation doit savoir de l'e-mail rendu. */
export interface EditorMarkerContext {
  /** La clé de l'e-mail : seules SES phrases sont marquées. */
  readonly mail: string;
  /** La variante de chaque chemin, telle que `GET …/phrases` la sert (`null` : aucune). */
  readonly variants: ReadonlyMap<string, string | null>;
}

interface Scan {
  out: string;
  inTag: boolean;
  readonly opened: boolean[];
}

function phraseOpening(context: EditorMarkerContext, path: string): string {
  const variant = context.variants.get(path) ?? null;
  const variantAttribute = variant === null ? "" : ` data-variant="${htmlEscape(variant)}"`;
  return `<span data-phrase="${htmlEscape(path)}"${variantAttribute}>`;
}

/** Un repère d'ouverture : rend l'index qui suit son séparateur. */
function open(scan: Scan, html: string, index: number, context: EditorMarkerContext): number {
  const isPhrase = html.charAt(index) === PHRASE_START;
  const separator = html.indexOf(isPhrase ? PHRASE_SEPARATOR : VARIABLE_SEPARATOR, index);
  const label = html.slice(index + 1, separator);
  let opening = "";
  if (isPhrase) {
    const [mail = "", path = ""] = label.split("|");
    opening = mail === context.mail ? phraseOpening(context, path) : "";
  } else {
    opening = `<span data-var="${htmlEscape(label)}">`;
  }
  const shown = !scan.inTag && opening !== "";
  scan.out += shown ? opening : "";
  scan.opened.push(shown);
  return separator + 1;
}

/**
 * Remplace les repères par leurs balises dans le TEXTE d'un HTML rendu, et
 * les ôte dans ses BALISES (le texte de repli d'une image). Le texte d'un
 * gabarit étant échappé, un `<` ouvre toujours une balise.
 */
export function revealEditorMarkers(html: string, context: EditorMarkerContext): string {
  const scan: Scan = { out: "", inTag: false, opened: [] };
  let index = 0;
  while (index < html.length) {
    const char = html.charAt(index);
    if (char === PHRASE_START || char === VARIABLE_START) {
      index = open(scan, html, index, context);
      continue;
    }
    if (char === PHRASE_END || char === VARIABLE_END) {
      scan.out += scan.opened.pop() === true ? "</span>" : "";
    } else {
      scan.inTag = char === "<" ? true : char === ">" ? false : scan.inTag;
      scan.out += char;
    }
    index += 1;
  }
  return scan.out;
}
