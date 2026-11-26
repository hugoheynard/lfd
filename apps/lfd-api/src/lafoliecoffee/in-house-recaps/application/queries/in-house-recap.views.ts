/**
 * Les vues du récapitulatif servies au back-office (`plan-restaurants-maison.md`,
 * D8–D10) — l'écran est au lot L4, qui les relèvera au paquet de contrats.
 */

/** Un récapitulatif dans la liste du payeur. */
export interface InHouseRecapSummaryView {
  readonly id: string;
  readonly number: string;
  readonly month: string;
  readonly issuedAt: string;
  readonly hasDocument: boolean;
  /** Le rectificatif qui le remplace, ou `null`. */
  readonly replacedById: string | null;
  readonly noteCount: number;
  readonly revisedNoteCount: number;
}

/** La liste d'un payeur : ses récapitulatifs, ses mois vides, ses mois manqués. */
export interface PayerInHouseRecapsView {
  readonly recaps: readonly InHouseRecapSummaryView[];
  /** Les mois que le passage a vus sans BL — rien à récapituler. */
  readonly emptyMonths: readonly string[];
  /** Les mois clos, maison, sans aucune issue : le passage ne les a pas faits. */
  readonly missedMonths: readonly string[];
}

/** Un BL couvert, avec sa version figée et la courante. */
export interface InHouseRecapNoteView {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly handedOverAt: string;
  readonly frozenVersion: number;
  readonly revised: boolean;
}

/** Le détail d'un récapitulatif. */
export interface InHouseRecapDetailView {
  readonly id: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly issuedAt: string;
  readonly hasDocument: boolean;
  readonly replacedById: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly saleUnit: string;
    readonly quantity: number;
  }[];
  readonly notes: readonly InHouseRecapNoteView[];
}

/** Un signalement : un récapitulatif non remplacé dont un BL a été révisé. */
export interface RevisedInHouseRecapView {
  readonly recapId: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly notes: readonly {
    readonly deliveryNoteId: string;
    readonly number: string;
    readonly frozenVersion: number;
    readonly currentVersion: number;
  }[];
}
