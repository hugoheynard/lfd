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
 * 🔴 **CE CONTRÔLEUR N'EST PAS BRANCHÉ**, et c'est délibéré (§6, §12).
 *
 * Il ne figure pas dans les `controllers` d'`OrdersModule` : la route n'existe
 * donc pas à l'exécution, et un appel rend 404. Le plan le dit en toutes
 * lettres — « ce plan ne s'ouvre pas quand il est bâti » : sa mise en service
 * dépend d'un **arbitrage de prix et de fiscalité** (le tarif de liste est-il
 * destiné au public ? à quel taux de TVA ?), qui n'est pas technique et qui
 * n'appartient à aucun lot.
 *
 * **Pour l'ouvrir** : ajouter `ShopOrdersController` aux `controllers` du
 * module. Tout le reste — contrat, handler, registre de clés, table — est en
 * place et éprouvé.
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
    return placed.payment === undefined
      ? { id: placed.id, orderNumber: placed.orderNumber }
      : { id: placed.id, orderNumber: placed.orderNumber, payment: placed.payment };
  }
}
