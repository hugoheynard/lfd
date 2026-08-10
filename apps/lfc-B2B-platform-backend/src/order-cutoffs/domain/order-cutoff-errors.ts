import { BusinessError, ResourceNotFoundError } from "../../shared/errors/app-error.js";

/** La règle visée n'existe pas (ou plus). */
export class OrderCutoffNotFoundError extends ResourceNotFoundError {
  constructor(readonly cutoffId: string) {
    super("order_cutoffs.not_found", "Règle d'heure limite introuvable.");
  }
}

/**
 * Une règle couvre déjà ce couple (point, jour). Refus **métier** : la demande
 * est bien formée, mais deux règles concurrentes rendraient la résolution
 * dépendante de l'ordre de lecture — c'est-à-dire de rien.
 */
export class DuplicateOrderCutoffError extends BusinessError {
  constructor() {
    super("order_cutoffs.duplicate", "Une règle couvre déjà ce point de retrait pour ce jour.");
  }
}
