import type { HandoverQueueView, ProductionPackingView } from '@lfd/contracts';

import { searchKey } from '../shared/search/search-key';

/**
 * **Ce que la recherche de la Supervision désigne** (Hugo, 2026-09-28) : des
 * commandes, par leur numéro, leur enseigne ou leur raison sociale — et, par
 * elles, les produits qu'elles portent en préparation.
 *
 * On SURLIGNE, on ne filtre pas : la Supervision montre la journée entière, et
 * une colonne qui se viderait à la frappe ferait croire qu'il n'y a plus rien
 * au four.
 */
export interface SupervisionMatches {
  /** Les numéros de commande trouvés — la clé commune aux trois colonnes. */
  readonly references: ReadonlySet<string>;
  /** Les SKU que ces commandes portent, pour la colonne Préparation. */
  readonly skus: ReadonlySet<string>;
}

export const NO_MATCHES: SupervisionMatches = { references: new Set(), skus: new Set() };

/**
 * Cherche dans ce que les colonnes MONTRENT. Le colisage ne connaît que la
 * raison sociale ; la file de retrait porte aussi l'enseigne — les deux sont
 * lues, et une commande trouvée par l'une est surlignée partout par son numéro.
 */
export function supervisionMatches(
  query: string,
  handover: HandoverQueueView | null,
  packing: ProductionPackingView | null,
): SupervisionMatches {
  const needle = searchKey(query);
  if (needle === '') {
    return NO_MATCHES;
  }
  const hit = (...fields: readonly (string | null)[]): boolean =>
    searchKey(fields.filter((field) => field !== null).join(' ')).includes(needle);

  const references = new Set<string>();
  for (const entry of handover?.entries ?? []) {
    if (hit(entry.reference, entry.customerLabel, entry.tradeName)) {
      references.add(entry.reference);
    }
  }
  for (const sheet of packing?.sheets ?? []) {
    if (hit(sheet.reference, sheet.customerLabel)) {
      references.add(sheet.reference);
    }
  }

  const skus = new Set<string>();
  for (const sheet of packing?.sheets ?? []) {
    if (references.has(sheet.reference)) {
      sheet.lines.forEach((line) => skus.add(line.sku));
    }
  }
  return { references, skus };
}
