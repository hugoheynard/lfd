import {
  type CreatedIdResponse,
  type DeclareWorkstationPayload,
  declareWorkstationPayloadSchema,
  type PlaceProductsPayload,
  placeProductsPayloadSchema,
  type RenameWorkstationPayload,
  renameWorkstationPayloadSchema,
  type ReorderWorkstationProductsPayload,
  reorderWorkstationProductsPayloadSchema,
  type ReorderWorkstationsPayload,
  reorderWorkstationsPayloadSchema,
  type SetFinishingWorkstationPayload,
  setFinishingWorkstationPayloadSchema,
  type SetWorkstationTrackingLevelPayload,
  setWorkstationTrackingLevelPayloadSchema,
  type WorkstationProductsPayload,
  workstationProductsPayloadSchema,
  type WorkstationsPageView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddWorkstationToProductsCommand } from "../application/commands/add-workstation-to-products.command.js";
import { ArchiveWorkstationCommand } from "../application/commands/archive-workstation.command.js";
import { DeclareWorkstationCommand } from "../application/commands/declare-workstation.command.js";
import { PlaceProductsCommand } from "../application/commands/place-products.command.js";
import { RemoveWorkstationFromProductsCommand } from "../application/commands/remove-workstation-from-products.command.js";
import { RenameWorkstationCommand } from "../application/commands/rename-workstation.command.js";
import { ReorderWorkstationProductsCommand } from "../application/commands/reorder-workstation-products.command.js";
import { ReorderWorkstationsCommand } from "../application/commands/reorder-workstations.command.js";
import { SetFinishingWorkstationCommand } from "../application/commands/set-finishing-workstation.command.js";
import { SetWorkstationTrackingLevelCommand } from "../application/commands/set-workstation-tracking-level.command.js";
import { ListWorkstationsQuery } from "../application/queries/list-workstations.query.js";

/**
 * **Prod manager › Postes** (`documentation/fournil/les-postes-du-fournil.md`, § 3.8),
 * sous `production_workstations` : la lecture (`GET`) pour qui consulte, les
 * gestes pour qui règle le fournil. Chaque geste est **par intention**
 * (`@IntentKey`) : rejouer un renommage après celui de quelqu'un d'autre le
 * déferait. Archiver est un `POST` nommé — un geste, pas une colonne qu'on
 * écrit. Il n'injecte que les bus.
 */
@Controller("admin/production/workstations")
@AdminSurface("production_workstations")
export class ProductionWorkstationsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<WorkstationsPageView> {
    return this.queries.execute<ListWorkstationsQuery, WorkstationsPageView>(
      new ListWorkstationsQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @Body(new ZodBody(declareWorkstationPayloadSchema)) payload: DeclareWorkstationPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DeclareWorkstationCommand, string>(
      new DeclareWorkstationCommand(payload.name, staffUserId, intentKey),
    );
    return { id };
  }

  @Put("order")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(
    @Body(new ZodBody(reorderWorkstationsPayloadSchema)) payload: ReorderWorkstationsPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ReorderWorkstationsCommand, void>(
      new ReorderWorkstationsCommand(payload.ids, staffUserId, intentKey),
    );
  }

  @Put("placements")
  @HttpCode(HttpStatus.NO_CONTENT)
  async place(
    @Body(new ZodBody(placeProductsPayloadSchema)) payload: PlaceProductsPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<PlaceProductsCommand, void>(
      new PlaceProductsCommand(payload.productSkus, payload.workstationId, staffUserId, intentKey),
    );
  }

  @Put(":id/name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async rename(
    @Param("id") id: string,
    @Body(new ZodBody(renameWorkstationPayloadSchema)) payload: RenameWorkstationPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RenameWorkstationCommand, void>(
      new RenameWorkstationCommand(id, payload.name, staffUserId, intentKey),
    );
  }

  /** Ce poste de plus pour ces produits : le premier poste d'un produit le finit. */
  @Post(":id/products")
  @HttpCode(HttpStatus.NO_CONTENT)
  async addToProducts(
    @Param("id") id: string,
    @Body(new ZodBody(workstationProductsPayloadSchema)) payload: WorkstationProductsPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<AddWorkstationToProductsCommand, void>(
      new AddWorkstationToProductsCommand(id, payload.productSkus, staffUserId, intentKey),
    );
  }

  /** Ce poste quitte ces produits ; un `POST` nommé — un geste, pas une ressource qu'on efface. */
  @Post(":id/products/removal")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromProducts(
    @Param("id") id: string,
    @Body(new ZodBody(workstationProductsPayloadSchema)) payload: WorkstationProductsPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RemoveWorkstationFromProductsCommand, void>(
      new RemoveWorkstationFromProductsCommand(id, payload.productSkus, staffUserId, intentKey),
    );
  }

  /** Ce poste finit désormais ce produit ; celui qui le finissait devient une étape. */
  @Put(":id/finishing")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setFinishing(
    @Param("id") id: string,
    @Body(new ZodBody(setFinishingWorkstationPayloadSchema))
    payload: SetFinishingWorkstationPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SetFinishingWorkstationCommand, void>(
      new SetFinishingWorkstationCommand(id, payload.productSku, staffUserId, intentKey),
    );
  }

  /** La pile du poste : exactement ses produits, du haut vers le bas. */
  @Put(":id/products/order")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderProducts(
    @Param("id") id: string,
    @Body(new ZodBody(reorderWorkstationProductsPayloadSchema))
    payload: ReorderWorkstationProductsPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ReorderWorkstationProductsCommand, void>(
      new ReorderWorkstationProductsCommand(id, payload.skus, staffUserId, intentKey),
    );
  }

  /** Le niveau de suivi propre au poste ; `null` : il suit le fournil. */
  @Put(":id/tracking-level")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setTrackingLevel(
    @Param("id") id: string,
    @Body(new ZodBody(setWorkstationTrackingLevelPayloadSchema))
    payload: SetWorkstationTrackingLevelPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SetWorkstationTrackingLevelCommand, void>(
      new SetWorkstationTrackingLevelCommand(id, payload.trackingLevel, staffUserId, intentKey),
    );
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ArchiveWorkstationCommand, void>(
      new ArchiveWorkstationCommand(id, staffUserId, intentKey),
    );
  }
}
