import { PurchaseCostOverflowError } from "../../errors/delivery-purchase-table-errors.js";

/** Les coûts d'une case du tableau croisé, en centimes HT ; `null` = inconnu. */
export interface PurchaseCost {
  readonly equipmentCostCents: number | null;
  readonly totalCostCents: number | null;
  readonly costPerLiterCents: number | null;
}

/**
 * **Les coûts d'une case** (B-D4) : équipement = bacs × prix unitaire, total =
 * véhicule + équipement, coût par litre = total ÷ litres utiles.
 *
 * Un prix inconnu rend `null` en cascade, JAMAIS zéro (B-D3) : un véhicule
 * sans prix garde son coût d'équipement, mais n'a ni total ni coût par litre.
 *
 * **Arrondi du coût par litre** : au centime le plus proche, moitié vers le
 * haut, en entiers — `⌊(2 × total + litres) ÷ (2 × litres)⌋`, sans flottant
 * intermédiaire. Le centime par litre suffit à départager des camionnettes
 * (un euro par litre vaut 100) ; l'écran n'en affiche pas plus.
 *
 * **Pas de BigInt, par les bornes** : un plancher tient au plus 1 000 × 1 000
 * cm², un bac au moins 1 cm² et 20 étages, soit 2·10⁷ bacs ; un prix vaut au
 * plus 10⁸ centimes (`PURCHASE_PRICE_MAX_CENTS`). Le pire total est ≈ 2·10¹⁵,
 * son double 4·10¹⁵, sous `Number.MAX_SAFE_INTEGER` (≈ 9·10¹⁵) : chaque
 * produit est exact. La garde ci-dessous ne sert qu'à dire un bogue si ces
 * bornes bougeaient un jour.
 */
export function purchaseCost(input: {
  readonly total: number;
  readonly usefulLiters: number;
  readonly vehiclePriceCents: number | null;
  readonly unitPriceCents: number | null;
}): PurchaseCost {
  const equipment =
    input.unitPriceCents === null ? null : exact(input.total * input.unitPriceCents);
  const totalCost =
    equipment === null || input.vehiclePriceCents === null
      ? null
      : exact(input.vehiclePriceCents + equipment);
  return {
    equipmentCostCents: equipment,
    totalCostCents: totalCost,
    costPerLiterCents:
      totalCost === null || input.usefulLiters === 0
        ? null
        : roundHalfUp(totalCost, input.usefulLiters),
  };
}

function roundHalfUp(cents: number, liters: number): number {
  return integerDivision(exact(2 * cents + liters), 2 * liters);
}

/** `⌊a ÷ b⌋` exact : la division flottante peut tomber d'une unité à côté près de 2⁵³, on la corrige. */
function integerDivision(dividend: number, divisor: number): number {
  let quotient = Math.floor(dividend / divisor);
  if (quotient * divisor > dividend) {
    quotient -= 1;
  } else if ((quotient + 1) * divisor <= dividend) {
    quotient += 1;
  }
  return quotient;
}

function exact(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new PurchaseCostOverflowError();
  }
  return value;
}
