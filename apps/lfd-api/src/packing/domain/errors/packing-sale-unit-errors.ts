import { DomainError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Un même article à la pièce et au poids sur une même feuille** (P6 de
 * `documentation/pricing/plan-vente-au-poids.md`). L'unité d'un article est
 * figée dès sa publication ; ce refus ne se produit donc que si le fait du
 * fournil est hors contrat. Technique : le personnel n'a pas de geste pour
 * le corriger.
 */
export class MixedSaleUnitLineError extends TechnicalError {
  constructor(sku: string) {
    super(
      "packing.line.mixed_sale_unit",
      `L'article ${sku} arrive au colisage à la fois à la pièce et au poids sur la même commande : ` +
        "le colisage ne peut pas additionner des pièces et des grammes. La commande n'a pas été " +
        "inscrite ; le message reste dans la boîte d'envoi — prévenir l'équipe technique, puis le " +
        "rejouer depuis la carte de santé.",
    );
  }
}

/**
 * **Un article au poids se met au bac en un lot** (P6) : on ne répartit pas
 * des grammes entre deux contenants, on ne retire pas « 200 g » d'un sac. Le
 * geste pose, retire ou déplace TOUT ce que le contenant porte de l'article.
 */
export class WeightLotSplitError extends DomainError {
  constructor(productName: string, expected: string, requested: string) {
    super(
      "packing.container.weight_lot_split",
      `« ${productName} » se vend au poids et se met au bac en un seul lot : ` +
        `le geste porte sur ${expected}, pas sur ${requested}. ` +
        "Rechargez la feuille : l'écran propose le lot entier.",
    );
  }
}
