import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une autorisation **encore ouverte** existe déjà pour ce client ce jour-là.
 *
 * Refus **métier** (409) : la demande est bien formée, c'est l'état du monde qui
 * s'y oppose. Le message nomme le geste de sortie — la dérogation existante sert
 * déjà, il n'y a rien à faire de plus.
 *
 * L'index partiel `order_cutoff_waiver_one_open` le refuse aussi en base : sans
 * lui, « la » dérogation d'un client un jour donné deviendrait une question de
 * tri, et deux commandes tardives passeraient sur une seule décision.
 */
export class OpenWaiverAlreadyExistsError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "orders.waiver.already_open",
      "Une dérogation est déjà accordée à ce client pour cette date, et n'a pas encore servi.",
    );
  }
}

/** La dérogation visée n'existe pas — ou a déjà servi, ce qui la ferme. */
export class OrderCutoffWaiverNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("orders.waiver.not_found", "Cette dérogation n'existe pas.");
  }
}
