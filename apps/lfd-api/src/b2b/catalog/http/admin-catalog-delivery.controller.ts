import { Body, Controller, Get, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { acceptDeliveryPayloadSchema, type PendingDeliveryView } from "@lfd/contracts";
import type { z } from "zod";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AcceptDeliveryCommand } from "../application/commands/accept-delivery.command.js";
import { GetPendingDeliveryQuery } from "../application/queries/get-pending-delivery.query.js";

/**
 * **La boîte de réception du catalogue**, côté écran.
 *
 * Ce que le référentiel a livré et que personne n'a encore accepté — et le geste
 * qui l'accepte.
 *
 * ## Le droit, et pourquoi celui-là
 *
 * `b2b_catalog` et **jamais** `pim_catalog`. C'est la séparation que le
 * découpage des droits par outil a rendue exprimable : valider ce qui entre en
 * vente est le métier du commercial, éditer les fiches du référentiel ne l'est
 * pas. Murer cette route derrière le droit du PIM ressouderait les deux rôles
 * qu'on venait de séparer, et rendrait le relecteur nécessairement auteur.
 */
@Controller("admin/catalog/delivery")
@AdminSurface("b2b_catalog")
export class AdminCatalogDeliveryController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * `null` quand rien n'attend : c'est l'état **normal** d'une plateforme à
   * jour, pas une ressource manquante. Un `404` ferait chercher une panne.
   */
  @Get()
  pending(): Promise<PendingDeliveryView | null> {
    return this.queries.execute<GetPendingDeliveryQuery, PendingDeliveryView | null>(
      new GetPendingDeliveryQuery(),
    );
  }

  /**
   * Valider — en une fois, avec les SKU qu'on écarte.
   *
   * L'identifiant vient du CLIENT et non de « l'arrivée courante » : entre
   * l'affichage et le clic, une nouvelle livraison a pu remplacer celle qu'on
   * a relue. Le serveur doit pouvoir refuser ce cas plutôt que valider
   * silencieusement autre chose que ce qui était à l'écran.
   */
  @Post("accept")
  async accept(
    @Body(new ZodBody(acceptDeliveryPayloadSchema))
    body: z.infer<typeof acceptDeliveryPayloadSchema>,
  ): Promise<void> {
    await this.commands.execute<AcceptDeliveryCommand, void>(
      new AcceptDeliveryCommand(
        body.deliveryId,
        body.excludedSkus,
        currentRequestContext()?.actor.id ?? null,
      ),
    );
  }
}
