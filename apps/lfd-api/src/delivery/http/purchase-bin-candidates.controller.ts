import {
  type CreatedIdResponse,
  type PurchaseBinCandidatePayload,
  purchaseBinCandidatePayloadSchema,
  type PurchaseLibraryListQuery,
  purchaseLibraryListQuerySchema,
  type PurchaseBinCandidatesView,
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
import { ArchivePurchaseBinCandidateCommand } from "../application/commands/archive-purchase-bin-candidate.command.js";
import { CorrectPurchaseBinCandidateCommand } from "../application/commands/correct-purchase-bin-candidate.command.js";
import { DeclarePurchaseBinCandidateCommand } from "../application/commands/declare-purchase-bin-candidate.command.js";
import { ReactivatePurchaseBinCandidateCommand } from "../application/commands/reactivate-purchase-bin-candidate.command.js";
import { ListPurchaseBinCandidatesQuery } from "../application/queries/list-purchase-bin-candidates.query.js";

/**
 * **La bibliothèque d'achat, formats de bacs candidats** — Livraison → Assistant d'achat
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, lot B1).
 *
 * Les droits du simulateur (B-D6) : lire sous `delivery_rounds:read`, écrire
 * sous `delivery_rounds:write` — le verbe HTTP dit l'action, et il ne ment sur
 * aucune route ici. Archiver et réactiver sont des `POST` nommés. Il n'injecte
 * que les bus.
 */
@Controller("admin/livraison/bibliotheque/bacs")
@AdminSurface("delivery_rounds")
export class PurchaseBinCandidatesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** `?archives=inclure` rend aussi les archivés. */
  @Get()
  list(
    @Query(new ZodQuery(purchaseLibraryListQuerySchema)) query: PurchaseLibraryListQuery,
  ): Promise<PurchaseBinCandidatesView> {
    return this.queries.execute<ListPurchaseBinCandidatesQuery, PurchaseBinCandidatesView>(
      new ListPurchaseBinCandidatesQuery(query.archives === "inclure"),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @Body(new ZodBody(purchaseBinCandidatePayloadSchema)) payload: PurchaseBinCandidatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DeclarePurchaseBinCandidateCommand, string>(
      new DeclarePurchaseBinCandidateCommand(payload, staffUserId),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(purchaseBinCandidatePayloadSchema)) payload: PurchaseBinCandidatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CorrectPurchaseBinCandidateCommand, void>(
      new CorrectPurchaseBinCandidateCommand(id, payload, staffUserId),
    );
  }

  @Post(":id/archiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ArchivePurchaseBinCandidateCommand, void>(
      new ArchivePurchaseBinCandidateCommand(id, staffUserId),
    );
  }

  @Post(":id/reactiver")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<ReactivatePurchaseBinCandidateCommand, void>(
      new ReactivatePurchaseBinCandidateCommand(id, staffUserId),
    );
  }
}
