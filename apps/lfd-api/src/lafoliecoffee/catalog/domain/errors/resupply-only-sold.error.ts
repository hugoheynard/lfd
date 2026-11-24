import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un article réservé au réassort des boutiques allait être servi à un
 * acheteur. `servedTo` le refuse aux pros comme au public : arriver ici dit
 * qu'une lecture l'a servi sans passer par lui.
 */
export class ResupplyOnlySoldError extends TechnicalError {
  constructor(sku: string) {
    super(
      "catalog.audience.resupply_only_sold",
      `L'article ${sku} est réservé au réassort des boutiques : il ne se sert à aucun acheteur.`,
    );
  }
}
