import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un SKU envoyé par le client n'existe pas au catalogue.
 *
 * Elle vit dans `catalog/` depuis le 2026-09-09, avec le port qui la lève :
 * c'est le catalogue qui sait ce qu'il ne connaît pas, et trois contextes en ont
 * besoin — la caisse, le tarificateur, la projection. Elle était dans
 * `orders/domain/errors/order-errors.ts`, ce qui obligeait `pricing` à importer
 * `orders` pour refuser un article.
 *
 * 🔴 **Son code reste `orders.sku.unknown`.** Un code d'erreur est une **valeur
 * servie**, pas un nom de fichier : le renommer serait un contrat cassé pour
 * tout client qui l'aiguille. Le déplacement est un rangement, pas une
 * migration.
 */
export class UnknownSkuError extends DomainError {
  constructor(readonly sku: string) {
    super("orders.sku.unknown", `Article inconnu au catalogue : ${sku}.`);
  }
}
