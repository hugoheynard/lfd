import type { SupervisionMatches } from './supervision-search';
import type { SupervisionColumn } from './supervision-links';

/**
 * **Une occurrence mise en avant** — ce que ‹ n / m › parcourt (Supervision v2,
 * A1 et A5). La clé est celle que la colonne pose en `data-hit-key` : un SKU
 * en Préparation, une référence de commande ailleurs.
 */
export interface SupervisionHit {
  readonly column: SupervisionColumn;
  readonly key: string;
}

/** Ce que `hitsOf` lit des trois planches — l'ordre de ce qu'elles montrent, rien d'autre. */
interface Keyed {
  readonly reference: string;
}
interface ShelfLines {
  readonly pending: readonly { readonly sku: string }[];
  readonly done: readonly { readonly sku: string }[];
}
export interface HitBoards {
  readonly preparation: {
    readonly open: readonly ShelfLines[];
    readonly finished: readonly ShelfLines[];
  } | null;
  readonly packing: {
    readonly upcoming: readonly Keyed[];
    readonly visible: readonly Keyed[];
    readonly packed: readonly Keyed[];
  } | null;
  readonly handover: {
    readonly pickup: readonly { readonly rows: readonly Keyed[] }[];
    readonly delivery: readonly { readonly rows: readonly Keyed[] }[];
  } | null;
}

/** Combien chaque colonne en porte — la puce de l'en-tête, la pastille bleue de l'onglet. */
export type HitCounts = Readonly<Record<SupervisionColumn, number>>;

/**
 * Les occurrences dans l'ordre de la page : colonne 1, 2, 3, et dans chacune
 * l'ordre où elle les montre. Lues sur les planches, pas sur l'écran : au
 * téléphone, une seule colonne existe dans le DOM, et le compte des onglets
 * doit pourtant dire les trois.
 */
export function hitsOf(
  matches: SupervisionMatches,
  { preparation, packing, handover }: HitBoards,
): readonly SupervisionHit[] {
  if (matches.mode === null) {
    return [];
  }
  const hits: SupervisionHit[] = [];
  const shelves = [...(preparation?.open ?? []), ...(preparation?.finished ?? [])];
  for (const line of shelves.flatMap((shelf) => [...shelf.pending, ...shelf.done])) {
    if (matches.skus.has(line.sku)) {
      hits.push({ column: 'preparation', key: line.sku });
    }
  }
  const cards = [
    ...(packing?.upcoming ?? []),
    ...(packing?.visible ?? []),
    ...(packing?.packed ?? []),
  ];
  for (const card of cards) {
    if (matches.references.has(card.reference)) {
      hits.push({ column: 'packing', key: card.reference });
    }
  }
  const groups = [...(handover?.pickup ?? []), ...(handover?.delivery ?? [])];
  for (const row of groups.flatMap((group) => group.rows)) {
    if (matches.references.has(row.reference)) {
      hits.push({ column: 'handover', key: row.reference });
    }
  }
  return hits;
}

export function hitCountsOf(hits: readonly SupervisionHit[]): HitCounts {
  const count = (column: SupervisionColumn): number =>
    hits.filter((hit) => hit.column === column).length;
  return {
    preparation: count('preparation'),
    packing: count('packing'),
    handover: count('handover'),
  };
}

/** Le curseur ramené dans la liste, dans les deux sens ; `null` sans occurrence. */
export function hitAt(
  hits: readonly SupervisionHit[],
  cursor: number,
): { readonly index: number; readonly hit: SupervisionHit } | null {
  if (hits.length === 0) {
    return null;
  }
  const index = ((cursor % hits.length) + hits.length) % hits.length;
  const hit = hits[index];
  return hit === undefined ? null : { index, hit };
}

/** L'élément à ~60 px du haut du corps de sa colonne (handoff, « Défilement »). */
const SCROLL_MARGIN_PX = 60;

/**
 * Faire défiler chaque colonne jusqu'à sa première occurrence, puis celle de
 * l'occurrence courante. Une clé que la colonne ne montre pas (filtrée, sur
 * l'autre acheminement) ne fait rien défiler : on ne fabrique pas de position.
 */
export function scrollToHits(
  root: HTMLElement,
  hits: readonly SupervisionHit[],
  current: SupervisionHit | null,
): void {
  const columns: readonly SupervisionColumn[] = ['preparation', 'packing', 'handover'];
  for (const column of columns) {
    const first = hits.find((hit) => hit.column === column);
    if (first !== undefined) {
      scrollTo(root, first);
    }
  }
  if (current !== null) {
    scrollTo(root, current);
  }
}

function scrollTo(root: HTMLElement, hit: SupervisionHit): void {
  const body = root.querySelector<HTMLElement>(`[data-column="${hit.column}"] [data-column-body]`);
  const target = body?.querySelector<HTMLElement>(`[data-hit-key="${CSS.escape(hit.key)}"]`);
  if (body === null || body === undefined || target === null || target === undefined) {
    return;
  }
  const offset = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
  body.scrollTop = body.scrollTop + offset - SCROLL_MARGIN_PX;
}
