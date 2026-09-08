import { shopQuotePayloadSchema, type ShopQuotePayload, type ShopQuoteView } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { QuoteShopCartQuery } from "../application/queries/quote-shop-cart.handler.js";

/**
 * **Le décompte du panier d'un client reconnu** — le jumeau muré de
 * `POST /shop/quote`.
 *
 * Même handler, même vue, même façon de compter : c'est le PRIX qui change, pas
 * l'arithmétique. Ce qui les sépare est l'audience — l'une chiffre pour un
 * visiteur, l'autre pour une société —, et ça se joue à l'entrée, pas dans le
 * calcul.
 *
 * ## Pourquoi une seconde route plutôt qu'une seule qui s'adapte
 *
 * `POST /shop/quote` est `@Public()`, et une route publique **ne résout aucun
 * principal** : le guard s'arrête avant. Lui faire authentifier « au cas où »
 * changerait le comportement de toutes les routes publiques du dépôt — dont
 * l'attribution au journal — pour un besoin qui tient en une route de plus.
 *
 * Aucun identifiant de société n'est passé : le serveur la résout depuis les
 * rattachements. Un client ne peut donc pas chiffrer un panier au tarif d'un
 * concurrent — il n'y a pas de paramètre à deviner.
 *
 * ⚠️ Sans société résolue (personne rattachée à rien, ou à plusieurs sans avoir
 * déclaré laquelle), le décompte est celui de la vitrine publique. C'est la
 * réponse honnête à « je ne sais pas encore pour qui », et elle est la même que
 * celle de `/shop/catalogue/mine` — les deux écrans ne peuvent pas se
 * contredire.
 */
@Controller("shop/quote")
export class MyShopQuoteController {
  constructor(private readonly queries: QueryBus) {}

  @Post("mine")
  @HttpCode(HttpStatus.OK)
  async quote(
    @Body(new ZodBody(shopQuotePayloadSchema)) payload: ShopQuotePayload,
    @ActingCompany() companyId: string | null,
  ): Promise<ShopQuoteView> {
    return this.queries.execute<QuoteShopCartQuery, ShopQuoteView>(
      new QuoteShopCartQuery(payload, companyId),
    );
  }
}
