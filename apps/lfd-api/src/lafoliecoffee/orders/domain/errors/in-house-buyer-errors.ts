import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un de nos restaurants ne paie pas par carte** (409) : ses commandes sont
 * internes, sans facturation ni encaissement. Le refus est nommé plutôt que
 * la carte ignorée : un écran qui la propose encore se trompe, et il faut le
 * voir.
 */
export class InHouseBuyerCardRefusedError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.in_house_card_refused",
      "Ce client est un de nos restaurants : ses commandes sont internes, sans facturation, et ne se règlent pas par carte. Passez la commande sans choisir de règlement.",
    );
  }
}

/**
 * **Pas de lien de règlement pour un de nos restaurants** (409) : la commande
 * est interne, il n'y a rien à encaisser.
 */
export class InHouseBuyerLinkRefusedError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.in_house_link_refused",
      "Ce client est un de nos restaurants : sa commande est interne, sans facturation, et n'a pas de lien de règlement. Choisissez « Au compte » : la commande sera enregistrée comme commande interne.",
    );
  }
}
