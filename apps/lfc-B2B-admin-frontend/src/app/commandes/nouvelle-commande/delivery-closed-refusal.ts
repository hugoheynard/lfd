import { DELIVERY_CLOSED_FOR_AUDIENCE } from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';

/**
 * Le refus « la livraison n'est pas proposée à la clientèle de ce compte » (409).
 *
 * On teste le **code** partagé par le contrat, jamais le message : il est écrit
 * pour être lu, et un relecteur a le droit de le reformuler sans casser la
 * relecture du réglage que ce refus déclenche.
 */
export function isDeliveryClosedRefusal(error: unknown): boolean {
  return httpErrorCode(error) === DELIVERY_CLOSED_FOR_AUDIENCE;
}
