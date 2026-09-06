import {
  shopCartPayloadSchema,
  type ShopCartPayload,
  type ShopCartResponse,
  type ShopCartView,
} from "@lfd/contracts";
import { Body, Controller, Get, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SaveShopCartCommand } from "../application/commands/save-shop-cart.command.js";
import { GetShopCartQuery } from "../application/queries/get-shop-cart.query.js";

/**
 * **Le panier en cours du client**, gardé chez nous.
 *
 * ## Pourquoi elle est MURÉE alors que la boutique ne l'est pas
 *
 * `GET /shop/catalogue` et `POST /shop/quote` sont publics par décision : on
 * visite d'abord, on s'identifie pour régler. Cette route-ci ne peut pas l'être,
 * pour une raison qui n'est pas de sécurité mais de sens — **un panier a un
 * propriétaire**. Sans jeton, il n'y en a pas ; en fabriquer un (un cookie posé
 * d'office, un identifiant de visiteur) reviendrait à marquer quelqu'un avant
 * qu'il n'ait rien demandé, ce qui est un sujet de consentement.
 *
 * Le panier de qui n'est pas reconnu reste donc dans son navigateur, et remonte
 * ici à la première visite reconnue. C'est la moitié du chantier qui vit côté
 * front, et elle n'est pas un provisoire : elle est ce qui permet à la boutique
 * de rester visitable.
 *
 * ## Deux verbes, et pas trois
 *
 * Il n'y a **pas de `DELETE`**. Un panier vidé est un panier à zéro ligne, écrit
 * comme les autres : c'est ce qui permet à « j'ai tout retiré sur mon
 * téléphone » d'atteindre l'ordinateur. Une ressource absente aurait dit la même
 * chose qu'une première visite, et la fusion aurait ressuscité le panier de la
 * veille.
 *
 * ## `PUT`, et pas `POST`
 *
 * L'opération est un **remplacement** de la seule ressource qui existe pour
 * cette personne — la rejouer deux fois ne crée pas deux paniers. C'est le même
 * parti que le brouillon du back-office, dont ce contrôleur est le frère.
 *
 * ⚠️ **La dernière écriture gagne**, et sans trace : contrairement au brouillon
 * partagé par une équipe, il n'y a ici personne d'autre à qui demander. Deux
 * onglets ouverts sur le même compte se recouvrent donc l'un l'autre — ce que le
 * `localStorage` faisait déjà, à ceci près qu'il ne le faisait qu'entre onglets
 * du même navigateur.
 */
@Controller("shop/cart")
export class ShopCartController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Le panier en cours — `{ cart: null }` quand il n'y en a pas. */
  @Get()
  async mine(@CurrentUser() user: Principal): Promise<ShopCartResponse> {
    const cart = await this.queries.execute<GetShopCartQuery, ShopCartView | null>(
      new GetShopCartQuery(user.userId),
    );
    return { cart };
  }

  /** Met le panier de côté. Le propriétaire vient de la porte, jamais du corps. */
  @Put()
  async save(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(shopCartPayloadSchema)) payload: ShopCartPayload,
  ): Promise<ShopCartView> {
    return this.commands.execute<SaveShopCartCommand, ShopCartView>(
      new SaveShopCartCommand(user.userId, payload),
    );
  }
}
