import type { CustomerAudience } from "./customer-audience.js";
import { ALL_DISCOUNT_AUDIENCES, type DiscountAudiences } from "./pickup-discount-audiences.js";

/**
 * **À qui un site remet ses commandes en retrait**, sans zod — lu par la
 * boutique au démarrage, comme le défaut des remises (même raison de poids,
 * cf. `pickup-discount-audiences.ts`).
 *
 * Décidé par Hugo le 2026-10-15 : un site peut être réservé au retrait d'une
 * clientèle (« mes pros ne peuvent plus retirer qu'à une seule boutique »),
 * réglé à l'écran du site. La règle est appliquée par le serveur sur les trois
 * passations et au devis ; ce module ne fait que la nommer une fois.
 */

/** Le refus d'un retrait sur un site fermé à la clientèle (409). */
export const PICKUP_CLOSED_FOR_AUDIENCE = "orders.pickup.closed_for_audience";

/**
 * Le site accepte-t-il le retrait de cette clientèle ? Un point servi sans les
 * cases (API d'avant le 2026-10-15, fixture ancienne) est ouvert aux deux :
 * l'existant.
 */
export function pickupOpenTo(
  point: { readonly pickupAudiences?: DiscountAudiences | undefined },
  audience: CustomerAudience,
): boolean {
  return (point.pickupAudiences ?? ALL_DISCOUNT_AUDIENCES)[audience];
}

/** Le refus d'un retrait sans point choisi quand aucun ne s'impose (409). */
export const PICKUP_CHOICE_REQUIRED = "orders.pickup.choice_required";

/**
 * **Le point de retrait présélectionné pour un client** (Hugo, 2026-10-15 —
 * le « site par défaut » a disparu), parmi les points OUVERTS à sa clientèle :
 *
 * 1. son point préféré (« Mon compte », `fulfillmentPreference.pickupAddressId`)
 *    s'il en fait partie ;
 * 2. sinon le seul point ouvert, s'il n'y en a qu'un ;
 * 3. sinon aucun (`null`) : le client choisit.
 *
 * Une seule règle, lue par le serveur (une commande ou un devis sans point
 * choisi) et par la boutique (le point coché à l'ouverture du choix) : deux
 * définitions finiraient par cocher un point que la caisse ne retiendrait pas.
 */
export function preselectedPickupId(
  offered: readonly { readonly id: string }[],
  preferredId: string | null,
): string | null {
  if (preferredId !== null && offered.some((point) => point.id === preferredId)) {
    return preferredId;
  }
  const [only, ...others] = offered;
  return only !== undefined && others.length === 0 ? only.id : null;
}
