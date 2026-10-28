import type { CustomerRequest } from "./customer-request.js";

/**
 * Une réponse par e-mail vient d'être rangée (plan
 * `plan-reponses-par-e-mail.md`, §2). **Un événement à elle** : la cloche s'y
 * abonne, et AUCUN courriel n'est relayé — `CustomerRequestReceivedEvent`,
 * qui écrit à l'adresse du motif, n'est pas émis pour ce type.
 *
 * Pas journalisé : ce n'est pas un acte du staff, et la charge porterait des
 * données personnelles qui s'anonymisent.
 */
export class CustomerEmailReplyReceived {
  constructor(
    readonly request: CustomerRequest,
    /** Les réponses de la même adresse déjà rangées dans l'heure qui précède. */
    readonly earlierFromSenderWithinHour: number,
  ) {}
}
