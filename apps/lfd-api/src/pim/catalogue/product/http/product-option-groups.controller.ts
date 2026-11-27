import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  activateProductOptionGroupPayloadSchema,
  type ActivateProductOptionGroupPayload,
  type ProductOptionGroupView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ActivateProductOptionGroupCommand } from "../options/activate-product-option-group.js";
import { DeactivateProductOptionGroupCommand } from "../options/deactivate-product-option-group.js";
import { ListProductOptionGroupsQuery } from "../options/list-product-option-groups.js";

/**
 * **Les options de commande d'une fiche** (`plan-options-de-commande.md`,
 * § 3.1), sous le même préfixe et le même mur que les fiches, dans leur
 * propre contrôleur : l'activation s'enregistre hors de « Tout enregistrer ».
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductOptionGroupsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":id/option-groups")
  list(@Param("id") id: string): Promise<ProductOptionGroupView[]> {
    return this.queries.execute<ListProductOptionGroupsQuery, ProductOptionGroupView[]>(
      new ListProductOptionGroupsQuery(id),
    );
  }

  /** Active le groupe, pour toutes les déclinaisons (`variantIds: null`) ou une liste. */
  @Put(":id/option-groups/:groupId")
  @Idempotent(
    "pose l'activation entière : rejouée, la fiche reste telle quelle et le journal se tait",
  )
  async activate(
    @Param("id") id: string,
    @Param("groupId") groupId: string,
    @Body(new ZodBody(activateProductOptionGroupPayloadSchema))
    body: ActivateProductOptionGroupPayload,
  ) {
    await this.commands.execute<ActivateProductOptionGroupCommand, void>(
      new ActivateProductOptionGroupCommand(id, groupId, body.variantIds),
    );
    return { id, groupId };
  }

  /** Retire le groupe de la fiche — l'activation est marquée retirée, jamais supprimée. */
  @Delete(":id/option-groups/:groupId")
  @Idempotent("retire le groupe : rejouée, il l'est déjà et rien ne s'écrit")
  async deactivate(@Param("id") id: string, @Param("groupId") groupId: string) {
    await this.commands.execute<DeactivateProductOptionGroupCommand, void>(
      new DeactivateProductOptionGroupCommand(id, groupId),
    );
    return { id, groupId };
  }
}
