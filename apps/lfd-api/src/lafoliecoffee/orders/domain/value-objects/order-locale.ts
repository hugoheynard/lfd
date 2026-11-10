import { contentLocales, type ContentLocale } from "@lfd/contracts";

import { UnknownOrderLocaleError } from "../errors/order-locale-errors.js";

/**
 * **La langue d'interface du client au moment où il a commandé** (lot A3,
 * `documentation/recommandation-produit/plan-audiences.md`).
 *
 * Portée par la commande, jamais par la personne : c'est un fait de la
 * passation, et un client qui change de langue demain ne réécrit pas ses
 * commandes d'hier. Son absence (`null` côté agrégat) est une réponse —
 * commande d'avant la colonne, saisie du staff, boutique qui ne l'a pas
 * envoyée —, jamais un défaut à combler par `fr`.
 */
export class OrderLocale {
  private constructor(readonly code: ContentLocale) {}

  /** @throws {UnknownOrderLocaleError} une langue que la boutique ne propose pas. */
  static of(raw: string): OrderLocale {
    const code = contentLocales.find((locale) => locale === raw);
    if (code === undefined) {
      throw new UnknownOrderLocaleError(raw);
    }
    return new OrderLocale(code);
  }

  /** La langue d'un payload, ou `null` quand le client n'en a pas envoyé. */
  static ofOptional(raw: string | undefined): OrderLocale | null {
    return raw === undefined ? null : OrderLocale.of(raw);
  }
}
