import { InvalidDeliveryNoteLineError } from "../errors/delivery-note-errors.js";

/**
 * Une ligne de bon de livraison, **recopiée** de sa ligne de commande
 * (invariant 3 du plan-cadre `plan-commande-bon-de-livraison-facture.md`) : un
 * reliquat garde les conditions de prix par construction.
 *
 * Les pendants TTC sont recopiés **tels quels** : `null` pour un pro ou une
 * commande d'avant R3, jamais rempli par calcul (plan E1, § 6). La trace de
 * résolution du prix n'est pas recopiée : le BL renvoie à sa commande.
 */
export interface DeliveryNoteLineState {
  readonly sku: string;
  readonly productName: string;
  /** Prix unitaire HT, en millicentimes. */
  readonly unitPriceMillicents: number;
  /** Taux de TVA en pourcent (`5.5`). */
  readonly vatRate: number;
  /** ≥ 0 : une ligne à zéro est recopiée, pour que « livré = Σ des BL » n'en perde aucune. */
  readonly quantity: number;
  readonly lineTotalCents: number;
  readonly unitPriceTtcCents: number | null;
  readonly lineTotalTtcCents: number | null;
}

/** Une ligne valide — immuable, auto-validée. */
export class DeliveryNoteLine {
  private constructor(readonly state: DeliveryNoteLineState) {}

  /** @throws {InvalidDeliveryNoteLineError} SKU vide, montant non entier, quantité négative, taux invalide. */
  static of(state: DeliveryNoteLineState): DeliveryNoteLine {
    const reason = refusalOf(state);
    if (reason !== null) {
      throw new InvalidDeliveryNoteLineError(state.sku, reason);
    }
    return new DeliveryNoteLine({ ...state });
  }
}

function refusalOf(line: DeliveryNoteLineState): string | null {
  if (line.sku.trim() === "") {
    return "SKU absent";
  }
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) {
    return `quantité ${String(line.quantity)} invalide (entier ≥ 0 attendu)`;
  }
  if (!Number.isFinite(line.vatRate) || line.vatRate < 0) {
    return `taux de TVA ${String(line.vatRate)} invalide`;
  }
  const amounts = [line.unitPriceMillicents, line.lineTotalCents];
  const optional = [line.unitPriceTtcCents, line.lineTotalTtcCents];
  const integral = (value: number): boolean => Number.isSafeInteger(value);
  if (!amounts.every(integral) || !optional.every((v) => v === null || integral(v))) {
    return "montant non entier";
  }
  return null;
}
