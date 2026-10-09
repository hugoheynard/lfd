import { shopQuotePayloadSchema, type ShopQuotePayload, type ShopQuoteView } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { QuoteShopCartQuery } from "../application/queries/quote-shop-cart.handler.js";

/**
 * **Ce que le panier de la boutique coûte**, sans jeton — comme la vitrine.
 *
 * ## Pourquoi ici, et pas sur `POST /orders/quote`
 *
 * Le devis client rend un **prix négocié** : il se mure comme la commande qui
 * l'appliquerait, sans quoi on sonderait la mercuriale d'un concurrent en
 * devinant son identifiant. La boutique, elle, est publique **par décision** —
 * un prospect sans compte doit voir la vitrine et son total. Ouvrir la route
 * murée aux anonymes aurait mêlé deux publics sur une même surface.
 *
 * C'est donc le second chemin que `shop-catalogue.controller.ts` annonçait :
 * même public, même absence de jeton, même règle de tri sur ce qui franchit.
 *
 * ## Ce qu'elle répare
 *
 * Le panier calculait son décompte dans le navigateur — `prix × quantité`, plus
 * une remise et des frais tirés d'une maquette. Le serveur, lui, facture au
 * prix résolu à la quantité, avec la remise du point de retrait et les frais de
 * la zone tels qu'ils sont EN BASE. Le client voyait un montant et en payait un
 * autre dès qu'un des trois divergeait.
 *
 * ## POST, sur une lecture
 *
 * Un panier de cent lignes ne tient pas dans une URL, et un `GET` avec un corps
 * n'est pas caché de façon fiable. `@HttpCode(OK)` dit ce que le verbe ne dit
 * plus : **rien n'est créé**.
 *
 * ## Le throttle
 *
 * Resserré comme `shop/catalogue` et pour la même raison, avec une raison de
 * plus : cette route **résout des prix**, donc elle lit la base plusieurs fois
 * par article. Une surface anonyme qui coûte doit être bornée deux fois — par
 * le nombre d'appels ici, et par les cent lignes du contrat.
 */
@Controller("shop/quote")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopQuoteController {
  constructor(private readonly queries: QueryBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async quote(
    @Body(new ZodBody(shopQuotePayloadSchema)) payload: ShopQuotePayload,
  ): Promise<ShopQuoteView> {
    return this.queries.execute<QuoteShopCartQuery, ShopQuoteView>(new QuoteShopCartQuery(payload));
  }
}
