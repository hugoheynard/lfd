import { weightLabel } from "@lfd/money";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus d'une quantité qui ne se lit pas dans l'unité de l'article
 * (`documentation/pricing/plan-vente-au-poids.md`, P3). Lus par du personnel et
 * par des clients : chacun nomme l'article, la quantité dite en grammes ou en
 * kilogrammes, et ce qu'il faut demander à la place. Jamais de correction
 * silencieuse — un poids arrondi au pas serait un autre prix que celui lu.
 */

/** La ligne dit une unité, l'article en vend une autre. */
export class SaleUnitMismatchError extends DomainError {
  constructor(
    readonly sku: string,
    readonly articleUnit: "piece" | "weight",
  ) {
    super(
      "orders.line.sale_unit_mismatch",
      articleUnit === "weight"
        ? `L'article ${sku} se vend au poids : sa quantité se donne en grammes ` +
            "(unité « weight »), pas en pièces. Rechargez la fiche de l'article, puis saisissez un poids."
        : `L'article ${sku} se vend à la pièce : sa quantité se donne en pièces, ` +
            "pas en grammes. Rechargez la fiche de l'article, puis saisissez un nombre de pièces.",
    );
  }
}

/** Un poids qui n'est pas un multiple du pas de l'article. */
export class WeightOffStepError extends DomainError {
  constructor(
    readonly sku: string,
    readonly weightGrams: number,
    readonly stepGrams: number,
  ) {
    const below = Math.floor(weightGrams / stepGrams) * stepGrams;
    const above = below + stepGrams;
    const choices =
      below > 0 ? `${weightLabel(below)} ou ${weightLabel(above)}` : weightLabel(above);
    super(
      "orders.line.weight_off_step",
      `${weightLabel(weightGrams)} de ${sku} : ce poids ne tombe pas sur le pas de l'article, ` +
        `qui se commande par ${weightLabel(stepGrams)}. Choisissez ${choices}.`,
    );
  }
}

/** Un poids sous le minimum de l'article. */
export class WeightBelowMinimumError extends DomainError {
  constructor(
    readonly sku: string,
    readonly weightGrams: number,
    readonly minimumGrams: number,
  ) {
    super(
      "orders.line.weight_below_minimum",
      `${weightLabel(weightGrams)} de ${sku} : cet article se commande à partir de ` +
        `${weightLabel(minimumGrams)}. Augmentez le poids, ou retirez la ligne.`,
    );
  }
}

/**
 * Un poids au-delà de la garde d'une tonne. Pas une limite métier (Hugo,
 * 2026-10-28) : une garde contre le zéro de trop.
 */
export class WeightAboveGuardError extends DomainError {
  constructor(
    readonly sku: string,
    readonly weightGrams: number,
    readonly guardGrams: number,
  ) {
    super(
      "orders.line.weight_above_guard",
      `${weightLabel(weightGrams)} de ${sku} : c'est plus de ${weightLabel(guardGrams)} sur une ` +
        "seule ligne, ce qui ressemble à une faute de frappe. Vérifiez le poids saisi (un zéro de trop ?).",
    );
  }
}

/**
 * Un article au poids sans pas de saisie : le référentiel refuse de l'activer
 * ainsi, donc le miroir du catalogue a reçu une fiche incomplète.
 */
export class WeightArticleWithoutStepError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "orders.line.weight_without_step",
      `L'article ${sku} se vend au poids mais n'a pas de pas de saisie : il ne peut pas être ` +
        "commandé. Renseignez le pas dans « Tarif & TVA » au référentiel, puis republiez la fiche.",
    );
  }
}
