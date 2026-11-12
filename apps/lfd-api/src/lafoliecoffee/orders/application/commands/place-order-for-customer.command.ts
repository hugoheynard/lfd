import type { AdminPlaceOrderPayload, StaffSettlement } from "@lfd/contracts";

/**
 * Passe une commande **au nom d'un client**, depuis le back-office.
 *
 * Deux identités et elles ne se confondent pas : `staffUserId` est celui qui
 * saisit (posé par la porte staff, jamais par le corps de la requête), et
 * `payload.buyerUserId` celui au nom de qui la commande est portée. La seconde
 * vient du corps parce que le commercial la choisit ; c'est pour cela que le
 * handler la vérifie contre la société, plutôt que de lui faire confiance.
 */
export class PlaceOrderForCustomerCommand {
  constructor(
    readonly staffUserId: string,
    readonly payload: AdminPlaceOrderPayload,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un second
     * envoi de même clé rend la commande déjà passée sans rien réécrire.
     */
    readonly intentKey: string,
  ) {}
}

/**
 * Résultat de la passation staff. `paymentUrl` n'est présent qu'en `link` : le
 * commercial le transmet au client, et il s'affiche à l'écran plutôt que de
 * partir seulement par e-mail — le canal e-mail n'a pas encore fait ses preuves
 * en production, et une commande prise au téléphone se conclut au téléphone.
 */
export interface PlaceOrderForCustomerResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly settlement: StaffSettlement;
  readonly totalCents: number;
  readonly paymentUrl?: string;
}
