import {
  type CreatedIdResponse,
  type PurchaseVehicleCandidatePayload,
  purchaseVehicleCandidatePayloadSchema,
  type PurchaseLibraryListQuery,
  purchaseLibraryListQuerySchema,
  type PurchaseVehicleCandidatesView,
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
import { ArchivePurchaseVehicleCandidateCommand } from "../application/commands/archive-purchase-vehicle-candidate.command.js";
import { CorrectPurchaseVehicleCandidateCommand } from "../application/commands/correct-purchase-vehicle-candidate.command.js";
import { DeclarePurchaseVehicleCandidateCommand } from "../application/commands/declare-purchase-vehicle-candidate.command.js";
import { ReactivatePurchaseVehicleCandidateCommand } from "../application/commands/reactivate-purchase-vehicle-candidate.command.js";
import { ListPurchaseVehicleCandidatesQuery } from "../application/queries/list-purchase-vehicle-candidates.query.js";

/**
 * **La bibliothèque d'achat, véhicules candidats** — Livraison → Assistant d'achat
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, lot B1).
 *
 * Les droits du simulateur (B-D6) : lire sous `delivery_rounds:read`, écrire
 * sous `delivery_rounds:write` — le verbe HTTP dit l'action, et il ne ment sur
 * aucune route ici. Archiver et réactiver sont des `POST` nommés. Il n'injecte
 * que les bus.
 */
@Controller("admin/livraison/bibliotheque/vehicules")
@AdminSurface("delivery_rounds")
export class PurchaseVehicleCandidatesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** `?archives=inclure` rend aussi les archivés. */
  @Get()
  list(
    @Query(new ZodQuery(purchaseLibraryListQuerySchema)) query: PurchaseLibraryListQuery,
  ): Promise<PurchaseVehicleCandidatesView> {
    return this.queries.execute<ListPurchaseVehicleCandidatesQuery, PurchaseVehicleCandidatesView>(
      new ListPurchaseVehicleCandidatesQuery(query.archives === "inclure"),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @Body(new ZodBody(purchaseVehicleCandidatePayloadSchema))
    payload: PurchaseVehicleCandidatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DeclarePurchaseVehicleCandidateCommand, string>(
      new DeclarePurchaseVehicleCandidateCommand(payload, staffUserId),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(purchaseVehicleCandidatePayloadSchema))
    payload: PurchaseVehicleCandidatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CorrectPurchaseVehicleCandidateCommand, void>(
      new CorrectPurchaseVehicleCandidateCommand(id, payload, staffUserId),
    );
  }

  @Post(":id/archiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ArchivePurchaseVehicleCandidateCommand, void>(
      new ArchivePurchaseVehicleCandidateCommand(id, staffUserId),
    );
  }

  @Post(":id/reactiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ReactivatePurchaseVehicleCandidateCommand, void>(
      new ReactivatePurchaseVehicleCandidateCommand(id, staffUserId),
    );
  }
}
