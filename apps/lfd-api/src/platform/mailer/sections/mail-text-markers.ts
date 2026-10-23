import { htmlEscape } from "@lfd/mailer";

/**
 * **Les repères de texte de l'aperçu** (plan `plan-textes-des-e-mails.md`,
 * E4, S4) : chaque texte du dictionnaire rendu dans l'aperçu est entouré d'un
 * `<span data-mail-text="<chemin>">` neutre, pour que l'écran sache quelle
 * carte il touche quand on clique dessus.
 *
 * Comment, sans toucher les vingt-huit gabarits : en aperçu, le dictionnaire
 * rend chaque texte encadré de trois caractères de la zone d'usage privé
 * Unicode — le début (avec l'e-mail et le chemin), la fin. Ils traversent
 * `fill`, l'échappement HTML et l'assainissement de l'objet sans être
 * touchés. Une fois le HTML rendu, `revealTextMarkers` les remplace par la
 * balise là où c'est du texte, et les efface là où c'est un attribut (le
 * texte de repli d'une image). Rien de tout ça n'arrive à un e-mail envoyé :
 * le dictionnaire ne marque que dans un périmètre d'aperçu.
 */

const START = "\uE000";
const SEPARATOR = "\uE001";
const END = "\uE002";

/** Un texte marqué : son e-mail, son chemin, puis lui-même. */
export function markText(mail: string, path: string, text: string): string {
  return `${START}${mail}|${path}${SEPARATOR}${text}${END}`;
}

/** Un dictionnaire dont chaque texte est marqué de son e-mail et de son chemin. */
export function markedCopy<T extends object>(copy: T): T {
  const marked = structuredClone(copy);
  for (const [mail, section] of Object.entries(marked)) {
    markInPlace(mail, "", section);
  }
  return marked;
}

function markInPlace(mail: string, path: string, node: unknown): void {
  if (typeof node !== "object" || node === null) {
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    if (typeof child === "string") {
      Reflect.set(node, key, markText(mail, childPath, child));
    } else {
      markInPlace(mail, childPath, child);
    }
  }
}

/** Ôte les repères — pour l'objet, les noms de pièces jointes. */
export function stripTextMarkers(text: string): string {
  return text.replace(/\uE000[^\uE001]*\uE001/gu, "").replace(/\uE002/gu, "");
}

/**
 * Remplace les repères par des balises dans le TEXTE d'un HTML, et les ôte
 * dans ses BALISES. Le texte d'un gabarit étant échappé, un `<` du HTML ouvre
 * toujours une balise : c'est ce qui rend la distinction sûre.
 */
export function revealTextMarkers(html: string): string {
  let out = "";
  let inTag = false;
  let index = 0;
  while (index < html.length) {
    const char = html.charAt(index);
    if (char === START) {
      const separator = html.indexOf(SEPARATOR, index);
      const [mail = "", path = ""] = html.slice(index + 1, separator).split("|");
      out += inTag ? "" : openingOf(mail, path);
      index = separator + 1;
      continue;
    }
    if (char === END) {
      out += inTag ? "" : "</span>";
    } else {
      inTag = char === "<" ? true : char === ">" ? false : inTag;
      out += char;
    }
    index += 1;
  }
  return out;
}

function openingOf(mail: string, path: string): string {
  return `<span data-mail-text="${htmlEscape(path)}" data-mail-text-of="${htmlEscape(mail)}">`;
}
