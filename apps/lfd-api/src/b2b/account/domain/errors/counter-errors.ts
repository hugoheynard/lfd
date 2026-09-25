import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le client demandé au Comptoir n'est pas servi : inconnu, **ou** non actif.
 *
 * Un seul refus pour les deux, et c'est voulu (plan
 * `documentation/order/plan-commande-au-comptoir.md`) : le comptoir ne
 * distingue pas un compte suspendu d'un compte absent — il n'a pas à lire
 * l'état commercial d'un client, seulement à savoir s'il peut lui vendre.
 *
 * Le message ne dit donc pas POURQUOI : il donne au vendeur la phrase à
 * dire au client (Hugo, 2026-09-25 : « dire au client de contacter le
 * service commercial »), et c'est le commercial, qui lit la fiche, qui
 * saura s'il est suspendu, en attente ou absent.
 */
export class CounterCustomerNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "account.counter_customer.not_found",
      "Ce client ne peut pas commander au comptoir. Invitez-le à contacter le service commercial, qui vérifiera son compte.",
    );
  }
}
