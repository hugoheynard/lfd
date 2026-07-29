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
  /** Display price, already formatted (e.g. "8,50 €"). */
  price?: string;
  /** Unit the price applies to (e.g. "/ kg", "/ carton de 12"). */
  unit?: string;
  /** Optional corner badge (e.g. "Nouveau", "Promo"). */
  badge?: string;
  /** Optional category handle — used by consumers to filter/group. */
  category?: string;
  /** Out of stock — the card shows a "rupture" ribbon and a notify button. */
  outOfStock?: boolean;
  /** Days left before it runs out — the card shows a "soon unavailable" warning. */
  daysLeft?: number;
  /** Optional card action (e.g. "Ajouter", "Voir"). */
  action?: FoldAction;
}
