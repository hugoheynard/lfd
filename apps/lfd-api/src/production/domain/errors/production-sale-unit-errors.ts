import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Un même article, deux unités, dans une même journée** (plan
 * `documentation/pricing/plan-vente-au-poids.md`, P6).
 *
 * Le compte à produire additionne par SKU. L'unité d'une déclinaison est
 * figée dès sa première publication, et le commerce refuse une ligne dont
 * l'unité ne suit pas l'article : ce refus ne se produit donc que si une
 * commande a été écrite hors de ces règles. Additionner quand même rendrait
 * « 1 262 » pour 12 pièces et 1 250 grammes — un nombre que personne ne
 * saurait cuire. Technique (500) : le personnel n'a pas de geste pour le
 * corriger, l'équipe technique si.
 */
export class MixedSaleUnitCountError extends TechnicalError {
  constructor(sku: string) {
    super(
      "production.count.mixed_sale_unit",
      `L'article ${sku} figure dans les commandes du jour à la fois à la pièce et au poids : ` +
        "le compte à produire ne peut pas additionner des pièces et des grammes. " +
        "Rien n'a été arrêté ; prévenir l'équipe technique, qui corrigera la commande en cause.",
    );
  }
}
