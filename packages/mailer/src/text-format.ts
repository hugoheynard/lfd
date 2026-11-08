/**
 * **La mise en forme de la version texte** d'un e-mail (`text/plain`) —
 * la partie que lisent les filtres anti-spam, les lecteurs d'écran
 * rudimentaires, les montres et les messageries qui refusent le HTML.
 *
 * Elle est fabriquée par le RENDU, à partir de ce qu'il pose (titre,
 * paragraphes, boutons, récapitulatif…), jamais en dépouillant le HTML : le
 * texte n'a donc ni balise ni entité à oublier, et il n'échappe rien.
 */

/** La largeur d'une ligne, en caractères — l'usage des messageries texte. */
export const TEXT_LINE_WIDTH = 78;

/** Le séparateur d'un bloc à l'autre : une ligne vide. */
const BLOCK_SEPARATOR = "\n\n";

/** Le séparateur d'une ligne de récapitulatif : « Article — quantité — prix ». */
export const TEXT_ROW_SEPARATOR = " — ";

/** Le filet d'un séparateur, en tirets. */
export const TEXT_RULE = "-".repeat(TEXT_LINE_WIDTH);

/**
 * Une ligne coupée aux espaces sous la largeur. Un mot plus long qu'une
 * ligne (une adresse) reste entier, seul sur la sienne : coupé, il ne se
 * cliquerait plus. Une espace insécable ne coupe pas (« 12,00 € »).
 */
function wrapLine(line: string): readonly string[] {
  const words = line.split(" ").filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= TEXT_LINE_WIDTH) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  return current === "" ? [] : [...lines, current];
}

/**
 * Un texte coupé à la largeur, ses retours à la ligne gardés — y compris
 * une ligne vide, qui sépare deux paragraphes du même texte.
 */
export function wrapText(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => wrapLine(line.trim()).join("\n"))
    .join("\n")
    .replace(/\n{3,}/gu, BLOCK_SEPARATOR)
    .trim();
}

/** Un titre souligné du caractère donné, à sa longueur (bornée à la ligne). */
export function underlined(title: string, mark: "=" | "-"): string {
  const text = wrapText(title);
  if (text === "") {
    return "";
  }
  const longest = Math.max(...text.split("\n").map((line) => line.length));
  return `${text}\n${mark.repeat(Math.min(longest, TEXT_LINE_WIDTH))}`;
}

/**
 * Un lien lisible sans HTML : « Libellé : https://… ». Quand la ligne
 * dépasserait la largeur, l'adresse passe seule à la ligne suivante — jamais
 * coupée, elle ne se cliquerait plus.
 */
export function linkLine(label: string, url: string): string {
  const text = wrapText(label);
  if (text === "") {
    return url;
  }
  const lastLine = text.slice(text.lastIndexOf("\n") + 1);
  const joined = `${lastLine} : ${url}`;
  return joined.length <= TEXT_LINE_WIDTH ? `${text} : ${url}` : `${text} :\n${url}`;
}

/** Des blocs de texte, séparés par une ligne vide ; les vides écartés. */
export function joinTextBlocks(blocks: readonly string[]): string {
  return blocks.filter((block) => block.trim() !== "").join(BLOCK_SEPARATOR);
}
