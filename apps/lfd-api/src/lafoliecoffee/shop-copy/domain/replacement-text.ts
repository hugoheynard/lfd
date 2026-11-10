import { InvalidShopCopyTextError } from "./shop-copy-errors.js";
import type { ShopCopyLocale } from "./shop-copy-locale.js";
import type { ShopCopyManifestEntry } from "./shop-copy-manifest.js";

/** Un remplacement peut faire jusqu'à quatre fois son original… */
export const MAX_LENGTH_FACTOR = 4;
/** …et au moins ceci, pour qu'un mot court puisse devenir une phrase. */
export const MIN_LENGTH_CEILING = 160;

const VARIABLE = /\{(\w+)\}/gu;
/** Une balise, ouvrante ou fermante, ou un commentaire HTML. */
const MARKUP = /<\/?[a-zA-Z!][^>]*>/u;

/** Les noms des `{variables}` d'un texte, triés, sans doublon. */
export function variablesOf(text: string): readonly string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1] ?? ""))].sort();
}

/** La longueur admise pour un remplacement de cet original. */
export function lengthCeilingOf(original: string): number {
  return Math.max(MAX_LENGTH_FACTOR * [...original].length, MIN_LENGTH_CEILING);
}

/**
 * **Un remplacement valide** — les garde-fous du §2 du plan, contre le
 * manifeste embarqué.
 *
 * - non vide : vider un texte, c'est revenir à l'original, un autre geste ;
 * - mêmes variables que l'original : un `{points}` perdu afficherait une
 *   phrase fausse, un `{inconnu}` resterait tel quel à l'écran ;
 * - longueur bornée ({@link lengthCeilingOf}) ;
 * - texte brut : la boutique échappe tout, une balise s'afficherait en clair.
 */
export function validReplacement(
  entry: ShopCopyManifestEntry,
  locale: ShopCopyLocale,
  text: string,
): string {
  if (text.trim().length === 0) {
    throw new InvalidShopCopyTextError(
      entry.key,
      "il est vide. Pour revenir au texte d'origine, utilisez « Revenir à l'original ».",
    );
  }
  const original = entry.originals[locale];
  const ceiling = lengthCeilingOf(original);
  if ([...text].length > ceiling) {
    throw new InvalidShopCopyTextError(
      entry.key,
      `il fait ${[...text].length} caractères, pour ${ceiling} au plus. Raccourcissez-le.`,
    );
  }
  if (MARKUP.test(text)) {
    throw new InvalidShopCopyTextError(
      entry.key,
      "il contient une balise (« <…> »). La boutique affiche du texte brut : retirez-la.",
    );
  }
  const expected = entry.variables;
  const found = variablesOf(text);
  if (expected.join(",") !== found.join(",")) {
    throw new InvalidShopCopyTextError(
      entry.key,
      `il doit garder exactement les variables ${braces(expected)} — il porte ${braces(found)}.`,
    );
  }
  return text;
}

function braces(names: readonly string[]): string {
  return names.length === 0 ? "« aucune »" : names.map((name) => `{${name}}`).join(", ");
}
