import {
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
  type CatalogItemView,
  type WorkshopLine,
} from '@lfd/contracts';

import { shelfLabel } from './production-recap';

/**
 * **Le groupement de la fiche d'atelier par rayon** — la catégorie EST le poste.
 *
 * La fiche arrive sans catégorie, et ce n'est pas un oubli : la production ne
 * connaît un article que par son SKU, elle ne lit pas le catalogue et ne doit
 * pas commencer. La jointure se fait donc ici, exactement comme le
 * récapitulatif la fait pour ses rayons — et avec les mêmes libellés, pour que
 * deux écrans du même fournil ne nomment pas deux fois la même chose.
 *
 * ⚠️ **Il y a CINQ rayons, pas six.** La maquette en dessine six et invente
 * « Boissons — sans four ». Aucune catégorie réelle n'est sans four, et rien
 * dans les données ne permettrait de le déduire : l'onglet en pointillés n'est
 * pas repris.
 */

/** Une fiche : un rayon, ses lignes, et où elle en est. */
export interface WorksheetGroup {
  /** `null` = les SKU que le catalogue ne connaît plus, ou qu'il n'a pas pu dire. */
  readonly category: CatalogCategory | null;
  readonly label: string;
  /** La clé d'onglet et de préférence — `'?'` pour le groupe sans rayon. */
  readonly key: string;
  readonly lines: readonly WorkshopLine[];
  readonly doneCount: number;
  /** Toutes lignes confondues, faites ou non. */
  readonly totalUnits: number;
  /** Ce qu'il reste à sortir — le seul chiffre qui intéresse à 4 h du matin. */
  readonly remainingUnits: number;
}

/**
 * La clé d'un groupe sans rayon. Un caractère qu'aucune catégorie ne porte, pour
 * qu'une préférence enregistrée ne puisse jamais le désigner par accident.
 */
export const UNSHELVED_KEY = '?';

/**
 * Groupe les lignes d'une fiche par rayon.
 *
 * Les rayons sortent dans l'**ordre de la vitrine** (`CATALOG_CATEGORY_ORDER`),
 * celui que l'équipe connaît déjà du catalogue. À l'intérieur d'un rayon, la
 * **quantité décroissante** — c'est par le plus gros que le fournil commence —
 * puis le nom, pour que deux lectures rendent exactement la même fiche.
 *
 * 🔴 **L'ordre ne bouge pas quand on coche.** Une ligne qui remonterait ou
 * descendrait au moment où on la coche ferait perdre sa place à quelqu'un qui a
 * les mains dans la farine, et la case suivante n'est plus celle qu'on visait.
 */
export function worksheetGroups(
  lines: readonly WorkshopLine[],
  catalogue: readonly CatalogItemView[],
  /**
   * Le catalogue a-t-il été LU ? `false` = la lecture a échoué, et l'absence
   * d'un SKU ne prouve alors rien sur lui.
   */
  shelvesKnown = true,
): readonly WorksheetGroup[] {
  const categoryOf = new Map(catalogue.map((item) => [item.sku, item.category]));
  const buckets = new Map<CatalogCategory | null, WorkshopLine[]>();

  for (const line of lines) {
    const category = categoryOf.get(line.sku) ?? null;
    const bucket = buckets.get(category) ?? [];
    bucket.push(line);
    buckets.set(category, bucket);
  }

  const ordered: (CatalogCategory | null)[] = [...CATALOG_CATEGORY_ORDER, null];
  return ordered
    .filter((category) => buckets.has(category))
    .map((category) => {
      const sorted = [...(buckets.get(category) ?? [])].sort(
        (a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, 'fr'),
      );
      return {
        category,
        label: shelfLabel(category, shelvesKnown),
        key: category ?? UNSHELVED_KEY,
        lines: sorted,
        doneCount: sorted.filter((line) => line.done).length,
        totalUnits: sorted.reduce((sum, line) => sum + line.quantity, 0),
        remainingUnits: sorted.reduce((sum, line) => sum + (line.done ? 0 : line.quantity), 0),
      };
    });
}
