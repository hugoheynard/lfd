import {
  BIN_CAPACITY_MAX_UNITS,
  BIN_CAPACITY_MIN_UNITS,
  type BinCapacityView,
  type BinProductView,
  type BinTypeView,
} from '@lfd/contracts';

/**
 * **La grille des contenances** — bacs × produits, la logique pure de l'écran
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4 bis v2-2).
 *
 * Une case dit combien d'unités d'un produit tient un bac ENTIER de ce type.
 * Vide, elle n'a pas de contenance : rien ne la devine, et le colisage le
 * signalera.
 */

/** La clé d'une case. Le SKU est opaque : un séparateur qu'il ne porte pas. */
export function cellKey(binTypeId: string, sku: string): string {
  return `${binTypeId}\u0000${sku}`;
}

/** Les cases renseignées, par clé. */
export function capacityIndex(capacities: readonly BinCapacityView[]): ReadonlyMap<string, number> {
  return new Map(capacities.map((cell) => [cellKey(cell.binTypeId, cell.sku), cell.units]));
}

/** Les SKU qui n'ont de contenance pour AUCUN type proposé. */
export function skusWithoutCapacity(
  products: readonly BinProductView[],
  typeIds: readonly string[],
  index: ReadonlyMap<string, number>,
): ReadonlySet<string> {
  return new Set(
    products
      .filter((product) => typeIds.every((id) => !index.has(cellKey(id, product.sku))))
      .map((product) => product.sku),
  );
}

/**
 * Les SKU d'un produit **froid** qui n'a de contenance QUE dans des types non
 * isothermes : il ne va que dans un bac isotherme, et aucun de ceux qu'on lui
 * a donnés ne l'est. Un produit froid sans AUCUNE contenance n'y est pas — il
 * est déjà dans les manques, pour une autre raison.
 */
export function coldWithoutIsotherm(
  products: readonly BinProductView[],
  types: readonly BinTypeView[],
  index: ReadonlyMap<string, number>,
): ReadonlySet<string> {
  return new Set(
    products
      .filter((product) => {
        if (!product.requiresCold) return false;
        const filled = types.filter((type) => index.has(cellKey(type.id, product.sku)));
        return filled.length > 0 && filled.every((type) => !type.isotherm);
      })
      .map((product) => product.sku),
  );
}

/** Sans accents ni casse : « éclair » se trouve en tapant « ECLAIR ». */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR');
}

/**
 * Les lignes à montrer : le terme sur le nom OU le SKU, et le filtre des
 * manques — `gaps` : les SKU à compléter, sans contenance ou froids sans bac
 * isotherme.
 */
export function visibleProducts(
  products: readonly BinProductView[],
  term: string,
  onlyGaps: boolean,
  gaps: ReadonlySet<string>,
): readonly BinProductView[] {
  const needle = folded(term.trim());
  return products.filter(
    (product) =>
      (!onlyGaps || gaps.has(product.sku)) &&
      (needle === '' ||
        folded(product.name).includes(needle) ||
        folded(product.sku).includes(needle)),
  );
}

export type CellReading =
  | { readonly ok: true; readonly units: number | null }
  | { readonly ok: false; readonly issue: string };

/**
 * Ce qu'une case saisie enverrait : un entier dans les bornes, ou `null` pour
 * une case vidée (la contenance est retirée). Jamais un arrondi : 2,5 unités
 * par bac n'a pas de sens, et le corriger en silence ferait une contenance que
 * personne n'a dite.
 */
export function readCell(value: number | null): CellReading {
  if (value === null) {
    return { ok: true, units: null };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, issue: 'Une contenance est un nombre entier d’unités.' };
  }
  if (value < BIN_CAPACITY_MIN_UNITS || value > BIN_CAPACITY_MAX_UNITS) {
    return {
      ok: false,
      issue: `Une contenance va de ${String(BIN_CAPACITY_MIN_UNITS)} à ${BIN_CAPACITY_MAX_UNITS.toLocaleString('fr-FR')} unités. Videz la case pour la retirer.`,
    };
  }
  return { ok: true, units: value };
}

/** « 3 produits sans aucune contenance » — ou `null` quand tout est renseigné. */
export function missingLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? '1 produit sans aucune contenance'
    : `${String(count)} produits sans aucune contenance`;
}

/** « 2 produits froids sans bac isotherme » — ou `null`. */
export function coldGapLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? '1 produit froid sans bac isotherme'
    : `${String(count)} produits froids sans bac isotherme`;
}
