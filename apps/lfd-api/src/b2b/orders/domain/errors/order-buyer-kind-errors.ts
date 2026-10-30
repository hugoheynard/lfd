import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Une commande « invité » qui porterait une société ou une saisie de
 * l'équipe. Aucune route ne l'exprime : seule la boutique publique pose
 * `guest`, sans l'une ni l'autre. Le refus garde le semis et les tests du
 * même côté que la base (CHECK `orders_buyer_kind_guest_shape`).
 */
export class GuestOrderOutsidePublicShopError extends DomainError {
  constructor() {
    super(
      "orders.buyer_kind.guest_outside_public_shop",
      "Une commande sans compte ne se passe que par la boutique publique : elle ne porte ni société ni saisie de l'équipe. Saisissez-la au nom d'un client qui a un compte.",
    );
  }
}
