import { SALES_TERMS_OUTDATED } from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les CGV cochées au panier ne sont plus celles en vigueur pour l'audience de
 * la commande (**409**) — un texte republié pendant que le panier était
 * ouvert, une clientèle qui a changé (société validée entre-temps), ou un
 * écran qui n'a rien montré alors qu'un texte existe.
 *
 * La boutique recharge le texte, décoche la case et affiche ce message : le
 * client relit avant de recommander. La commande n'est pas prise, et sa clé
 * d'idempotence est rendue.
 */
export class SalesTermsOutdatedError extends BusinessError {
  constructor() {
    super(
      SALES_TERMS_OUTDATED,
      "Les conditions générales de vente ont changé depuis l'affichage de votre panier : relisez-les et cochez à nouveau.",
    );
  }
}
