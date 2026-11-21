/**
 * **Quelle fiche ouvrir, et quelle ligne montrer** — fonctions pures de la
 * fiche d'atelier, testées sans monter l'écran. Elles ne lisent d'une fiche
 * que sa clé et les SKU de ses lignes.
 */

/** Ce que le choix lit d'une fiche servie (`WorkshopGroup`). */
export interface SelectableGroup {
  readonly key: string;
  readonly lines: readonly { readonly sku: string }[];
}

/** `''` ou absent : le paramètre d'adresse n'a pas été donné. */
function given(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * La ligne qu'un lien de la cloche désigne (`?jour=…&ligne=…`), si la journée
 * lue est celle du lien ; `null` sinon. Un lien sans jour vaut pour la journée lue.
 */
export function linkedSkuOf(
  line: string | undefined,
  linkDay: string | undefined,
  readDay: string | null,
): string | null {
  if (!given(line) || readDay === null) {
    return null;
  }
  return !given(linkDay) || linkDay === readDay ? line : null;
}

/** Le jour du lien quand il n'est PAS celui lu — la fiche le dit ; `null` sinon. */
export function linkedElsewhereDay(
  linkDay: string | undefined,
  readDay: string | null,
): string | null {
  return !given(linkDay) || readDay === null || linkDay === readDay ? null : linkDay;
}

/** La clé de la fiche qui porte cette ligne ; `null` si aucune. */
export function groupKeyOfLine(
  groups: readonly SelectableGroup[],
  sku: string | null,
): string | null {
  if (sku === null) {
    return null;
  }
  return groups.find((group) => group.lines.some((line) => line.sku === sku))?.key ?? null;
}

/**
 * La fiche affichée. Les clés sont lues dans l'ordre de priorité — choisie à
 * l'écran, puis portée par le lien, puis demandée par l'adresse, puis la
 * dernière ouverte par la personne — et la première qui existe gagne. Aucune :
 * la première fiche servie.
 */
export function pickGroup<G extends SelectableGroup>(
  groups: readonly G[],
  keysByPriority: readonly (string | null)[],
): G | null {
  for (const key of keysByPriority) {
    const found = key === null ? undefined : groups.find((group) => group.key === key);
    if (found !== undefined) {
      return found;
    }
  }
  return groups[0] ?? null;
}
