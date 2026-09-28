import type { HandoverQueueView, PackingSheet, ProductionPackingView } from '@lfd/contracts';

import { searchKey } from '../shared/search/search-key';

import type { HandoverBoard, SlotRow } from './handover-slots';
import { awaitsPacking } from './packing-cards';

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
  /**
   * D'où vient la mise en avant (Supervision v2, A5) : `search` = la recherche
   * ou une pastille de blocage — contour primaire ; `products` = on suit des
   * PRODUITS attendus du four (pastille « four » ou commande dépliée) — les
   * lignes visées ressortent, le reste recule. `null` = rien n'est mis en avant.
   */
  readonly mode: 'search' | 'products' | null;
  /**
   * Pour `products` : SKU → enseignes des commandes qui l'attendent, pour
   * l'étiquette « Attendu · Chalet Marmotte ». Vide sinon.
   */
  readonly awaitedBy: ReadonlyMap<string, readonly string[]>;
  /**
   * La clé de l'occurrence courante de ‹ n / m › (une référence de commande ou
   * un SKU), qui reçoit le halo. `null` hors navigation.
   */
  readonly current: string | null;
}

export const NO_MATCHES: SupervisionMatches = {
  references: new Set(),
  skus: new Set(),
  mode: null,
  awaitedBy: new Map(),
  current: null,
};

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
  return { references, skus, mode: 'search', awaitedBy: new Map(), current: null };
}

/**
 * Une pastille de blocage cliquée (Supervision v2, A5) — la cause qu'elle
 * compte : le four, le colisage, et les trois causes du retrait.
 */
export type SupervisionFocus = 'oven' | 'packing' | 'kitchen' | 'held' | 'customer';

/** Les références dont une file de retrait dit qu'elles portent cette cause. */
function handoverReferences(
  focus: Exclude<SupervisionFocus, 'oven' | 'packing'>,
  handover: HandoverBoard | null,
): Set<string> {
  const rows = [...(handover?.pickup ?? []), ...(handover?.delivery ?? [])].flatMap(
    (group) => group.rows,
  );
  const hit = (row: SlotRow): boolean => {
    switch (focus) {
      case 'kitchen':
        return row.overdueCause === 'kitchen';
      case 'customer':
        return row.overdueCause === 'customer';
      case 'held':
        return row.heldForQuality;
    }
  };
  return new Set(rows.filter(hit).map((row) => row.reference));
}

/**
 * Les SKU **dont l'absence a mis un retrait dans le rouge** : une
 * commande au créneau dépassé PAR NOUS (`overdueCause === 'kitchen'`) qui les
 * attend encore. La Préparation leur met un bord rouge (Hugo, 2026-09-28).
 */
export function lateSkusOf(
  packing: ProductionPackingView | null,
  board: HandoverBoard | null,
): ReadonlySet<string> {
  const late = new Set(
    [...(board?.pickup ?? []), ...(board?.delivery ?? [])]
      .flatMap((group) => group.rows)
      .filter((row) => row.overdueCause === 'kitchen')
      .map((row) => row.reference),
  );
  const skus = new Set<string>();
  for (const sheet of packing?.sheets ?? []) {
    if (sheet.packedAt === null && late.has(sheet.reference)) {
      sheet.lines.filter((line) => line.awaitingProduction).forEach((line) => skus.add(line.sku));
    }
  }
  return skus;
}

/**
 * Suivre des PRODUITS attendus du four, depuis les commandes qui les attendent
 * — la pastille « four » (toutes) ou une commande dépliée (une seule). Lu dans
 * `lines[].awaitingProduction`, comme la carte de colisage : c'est le fournil
 * qui le calcule. L'étiquette nomme l'enseigne quand la file la connaît.
 */
function productMatches(
  sheets: readonly PackingSheet[],
  handover: HandoverQueueView | null,
): SupervisionMatches {
  const trade = new Map((handover?.entries ?? []).map((e) => [e.reference, e.tradeName]));
  const references = new Set<string>();
  const awaitedBy = new Map<string, string[]>();
  for (const sheet of sheets) {
    const awaited = sheet.lines.filter((line) => line.awaitingProduction);
    if (awaited.length === 0) {
      continue;
    }
    references.add(sheet.reference);
    const name = trade.get(sheet.reference) ?? sheet.customerLabel;
    for (const line of awaited) {
      const names = awaitedBy.get(line.sku) ?? [];
      if (!names.includes(name)) {
        names.push(name);
      }
      awaitedBy.set(line.sku, names);
    }
  }
  return {
    references,
    skus: new Set(awaitedBy.keys()),
    mode: 'products',
    awaitedBy,
    current: null,
  };
}

/** Ce qu'une pastille de blocage met en avant. */
export function focusMatches(
  focus: SupervisionFocus,
  packing: ProductionPackingView | null,
  handover: HandoverQueueView | null,
  board: HandoverBoard | null,
): SupervisionMatches {
  if (focus === 'oven') {
    return productMatches(packing?.sheets ?? [], handover);
  }
  if (focus === 'packing') {
    const references = new Set(
      (packing?.sheets ?? []).filter(awaitsPacking).map((sheet) => sheet.reference),
    );
    return { ...NO_MATCHES, references, mode: 'search' };
  }
  return {
    references: handoverReferences(focus, board),
    skus: new Set(),
    mode: 'search',
    awaitedBy: new Map(),
    current: null,
  };
}

/** Une commande « attend le four » dépliée : elle, et les produits qu'elle attend. */
export function awaitedMatches(
  reference: string,
  packing: ProductionPackingView | null,
  handover: HandoverQueueView | null,
): SupervisionMatches {
  const sheet = packing?.sheets.find((candidate) => candidate.reference === reference);
  return sheet === undefined ? NO_MATCHES : productMatches([sheet], handover);
}
