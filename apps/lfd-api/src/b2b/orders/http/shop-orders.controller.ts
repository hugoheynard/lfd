import {
  placeShopOrderPayloadSchema,
  type PlaceShopOrderPayload,
  type PlacedOrderResponse,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PlaceShopOrderCommand,
  type PlaceShopOrderResult,
} from "../application/commands/place-shop-order.command.js";

/**
 * **Commander sans compte** — plan
 * `documentation/order/plan-commande-sans-compte.md`, §5 et lot C.
 *
 * 🔴 **Ouvert le 2026-10-11** (§6). Il est resté construit et non branché
 * tant qu'un arbitrage de prix et de fiscalité manquait. Hugo l'a tranché :
 * « la TVA publique, c'est la même boutique que public mais juste pas loggé,
 * pareil pour le prix ». Un visiteur paie donc exactement ce que paie un
 * particulier connecté — et c'est ce que calcule déjà `OrderDrafting` sans
 * société, le même service que la commande connectée (vérifié le 2026-10-11).
 *
 * ## Le débit
 *
 * 5 appels par minute et par IP, là où la vitrine et le devis en autorisent 60.
 * Une route publique qui **écrit** — une commande, une personne, une intention
 * de paiement chez le prestataire — n'a pas le même coût qu'une lecture. C'est
 * la première route non authentifiée du dépôt qui écrit au nom d'un client : les
 * autres (webhooks, balayage des médias) sont machine-à-machine et protégées par
 * signature (plan §1.3).
 *
 * ⚠️ `getTracker` clé sur l'IP cliente, et une IP se partage comme elle se
 * change : ce débit borne l'accident et la maladresse, pas l'acharnement. Le
 * plan le note comme non vérifié (§10).
 */
@Controller("shop/orders")
@Public()
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class ShopOrdersController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Passe la commande d'un visiteur.
   *
   * 🔴 **L'identité est dans le corps, et elle n'est qu'une déclaration.** C'est
   * l'exact inverse de `POST /orders`, où l'acteur vient du jeton et la société
   * du contexte. Ici il n'y a rien à établir : ce que le corps porte sert à
   * **joindre** le client (confirmation, QR de retrait), jamais à l'autoriser.
   * Rien de ce qui est tapé ici n'ouvre quoi que ce soit — la personne inscrite
   * n'a aucune identité de connexion.
   *
   * La réponse est celle de la passation connectée (`PlacedOrderResponse`) : le
   * front a un seul écran de règlement, et deux formes pour un même paiement lui
   * feraient porter la distinction jusqu'à Stripe.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async place(
    @Body(new ZodBody(placeShopOrderPayloadSchema)) payload: PlaceShopOrderPayload,
  ): Promise<PlacedOrderResponse> {
    const placed = await this.commands.execute<PlaceShopOrderCommand, PlaceShopOrderResult>(
      new PlaceShopOrderCommand(payload),
    );
    // `payment` n'est ajouté que s'il existe (exactOptionalPropertyTypes) : il
    // est absent d'un rejeu, par décision — cf. `PlaceShopOrderHandler.replay`.
    const base = {
      id: placed.id,
      orderNumber: placed.orderNumber,
      loyaltyPointsWithAccount: placed.loyaltyPointsWithAccount,
      welcomeBonusPoints: placed.welcomeBonusPoints,
    };
    return placed.payment === undefined ? base : { ...base, payment: placed.payment };
  }
}
