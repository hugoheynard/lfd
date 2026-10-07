import {
  type CreatedIdResponse,
  type PurchaseScenarioListQuery,
  purchaseScenarioListQuerySchema,
  type PurchaseScenariosView,
  type PurchaseScenarioView,
  type SavePurchaseScenarioPayload,
  savePurchaseScenarioPayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { ArchivePurchaseScenarioCommand } from "../application/commands/archive-purchase-scenario.command.js";
import { ReactivatePurchaseScenarioCommand } from "../application/commands/reactivate-purchase-scenario.command.js";
import { RecordPurchaseScenarioCommand } from "../application/commands/record-purchase-scenario.command.js";
import { ReplacePurchaseScenarioCommand } from "../application/commands/replace-purchase-scenario.command.js";
import { GetPurchaseScenarioQuery } from "../application/queries/get-purchase-scenario.query.js";
import { ListPurchaseScenariosQuery } from "../application/queries/list-purchase-scenarios.query.js";

/**
 * **Les scénarios d'achat** — Livraison → Assistant d'achat → Tableau
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D5, lot B3).
 *
 * Les droits du simulateur (B-D6) : lire sous `delivery_rounds:read`, écrire
 * sous `delivery_rounds:write` — le verbe HTTP dit l'action, et il ne ment sur
 * aucune route ici. Relancer le tableau n'est pas ici : l'écran envoie la
 * sélection relue au `POST …/tableau` existant. Il n'injecte que les bus.
 */
@Controller("admin/livraison/assistant-achat/scenarios")
@AdminSurface("delivery_rounds")
export class PurchaseScenariosController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** `?archives=inclure` rend aussi les archivés. */
  @Get()
  list(
    @Query(new ZodQuery(purchaseScenarioListQuerySchema)) query: PurchaseScenarioListQuery,
  ): Promise<PurchaseScenariosView> {
    return this.queries.execute<ListPurchaseScenariosQuery, PurchaseScenariosView>(
      new ListPurchaseScenariosQuery(query.archives === "inclure"),
    );
  }

  /**
   * Un scénario rouvert : un élément archivé ou disparu est NOMMÉ dans
   * `issues`, il n'empêche pas d'ouvrir ; un contenu illisible rend un 409.
   */
  @Get(":id")
  read(@Param("id") id: string): Promise<PurchaseScenarioView> {
    return this.queries.execute<GetPurchaseScenarioQuery, PurchaseScenarioView>(
      new GetPurchaseScenarioQuery(id),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(
    @Body(new ZodBody(savePurchaseScenarioPayloadSchema)) payload: SavePurchaseScenarioPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<RecordPurchaseScenarioCommand, string>(
      new RecordPurchaseScenarioCommand(payload, staffUserId),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async replace(
    @Param("id") id: string,
    @Body(new ZodBody(savePurchaseScenarioPayloadSchema)) payload: SavePurchaseScenarioPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReplacePurchaseScenarioCommand, void>(
      new ReplacePurchaseScenarioCommand(id, payload, staffUserId),
    );
  }

  @Post(":id/archiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ArchivePurchaseScenarioCommand, void>(
      new ArchivePurchaseScenarioCommand(id, staffUserId),
    );
  }

  @Post(":id/reactiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ReactivatePurchaseScenarioCommand, void>(
      new ReactivatePurchaseScenarioCommand(id, staffUserId),
    );
  }
}
