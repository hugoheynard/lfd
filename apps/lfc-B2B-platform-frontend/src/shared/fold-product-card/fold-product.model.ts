import type { FoldAction } from '../fold-action/fold-action.model';

/**
 * One product shown as a card. Presentational data only — pricing is passed
 * pre-formatted so the card never guesses currency/locale.
 */
export interface FoldProduct {
  /** Stable handle. */
  id: string;
  /** Product name (headline of the card). */
  name: string;
  /** Product visual URL. Omit for an initial-lettered placeholder. */
  image?: string;
  /** Alt text for the visual (falls back to the name). */
  imageAlt?: string;
  /** Short descriptor line (origin, format, intensity…). */
  detail?: string;
  /** Display price, already formatted (e.g. "8,50 €"). In a B2B catalogue this is
   *  the **unit price, HT** — the parent decides the currency/locale/HT framing. */
  price?: string;
  /** Unit the price applies to (e.g. "/ kg", "/ pièce", "/ carton de 12"). */
  unit?: string;
  /** Optional corner badge (e.g. "Nouveau", "Promo"). */
  badge?: string;
  /** Optional category handle — used by consumers to filter/group. */
  category?: string;

  /* ── Ordering semantics (B2B) — all optional, presentational-adjacent: the
   *    card renders a quantity stepper bounded by them and a live line subtotal.
   *    Absent ⇒ sensible defaults (free unit ordering, min 1). ────────────── */

  /** SKU / reference. B2B buyers order by reference — shown on the card and the
   *  order-pad row, and (later) searchable. */
  reference?: string;
  /** Numeric unit price (**HT**) in the card's currency, for the live line
   *  subtotal (`priceValue × qty`). `price` stays the formatted unit-price label. */
  priceValue?: number;
  /** Order multiple (colisage / PCB): the chosen quantity is constrained to a
   *  multiple of this. Default `1` (free unit ordering) when absent. */
  step?: number;
  /** Minimum orderable quantity. Default `1` when absent. */
  minQty?: number;
  /** Optional packaging label (e.g. "carton de 12") for the order-pad PCB column. */
  packLabel?: string;
  /** Out of stock — the card shows a "rupture" ribbon and a notify button. */
  outOfStock?: boolean;
  /** Days left before it runs out — the card shows a "soon unavailable" warning. */
  daysLeft?: number;
  /** Optional card action (e.g. "Ajouter", "Voir"). */
  action?: FoldAction;
}

/** A product ordered at a chosen quantity — the payload of the card's add action. */
export interface FoldProductOrder {
  readonly product: FoldProduct;
  readonly quantity: number;
}
