import type { SaleUnit } from "@lfd/money";

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
  /**
   * ≥ 0 : une ligne à zéro est recopiée, pour que « livré = Σ des BL » n'en
   * perde aucune. Des pièces, ou des GRAMMES si `saleUnit = weight`.
   */
  readonly quantity: number;
  /**
   * Recopiée de la ligne de commande (`vente-au-poids.md`, P5) : au poids,
   * le prix unitaire est au kilo et un départ partiel se recompose en grammes.
   */
  readonly saleUnit: SaleUnit;
  readonly lineTotalCents: number;
  readonly unitPriceTtcCents: number | null;
  readonly lineTotalTtcCents: number | null;
  /**
   * Recopié de la ligne de commande (plan E4a) ; `null` sur une ligne écrite
   * avant E4a, jamais deviné.
   */
  readonly pickupDiscountEligible: boolean | null;
}

/** Une ligne telle que la commande la donne : l'éligibilité y est toujours connue. */
export interface DeliveryNoteSourceLine extends DeliveryNoteLineState {
  readonly pickupDiscountEligible: boolean;
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

  /**
   * La même ligne, son éligibilité remplie depuis la ligne de commande de même
   * rang — seulement si elle manquait et que c'est bien la même ligne (SKU,
   * quantité, total). Sinon, inchangée : on ne devine pas.
   */
  withEligibilityFrom(source: DeliveryNoteSourceLine | undefined): DeliveryNoteLine {
    const { state } = this;
    const same =
      source !== undefined &&
      source.sku === state.sku &&
      source.saleUnit === state.saleUnit &&
      source.quantity === state.quantity &&
      source.lineTotalCents === state.lineTotalCents;
    if (state.pickupDiscountEligible !== null || !same) {
      return this;
    }
    return new DeliveryNoteLine({
      ...state,
      pickupDiscountEligible: source.pickupDiscountEligible,
    });
  }
}

/**
 * L'unité lue en base, dans le vocabulaire du domaine. Refuse plutôt que de
 * replier sur `piece` : une ligne en grammes relue en pièces se chiffrerait
 * mille fois trop cher au premier départ partiel.
 *
 * @throws {InvalidDeliveryNoteLineError} une valeur hors de `piece` / `weight`.
 */
export function deliveryNoteSaleUnitOf(sku: string, value: string): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new InvalidDeliveryNoteLineError(
    sku,
    `unité « ${value} » inconnue (« piece » ou « weight » attendue)`,
  );
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
