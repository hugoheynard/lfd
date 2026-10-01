import { type PendingStopDecisionsView, STOP_DECISION_PERMISSION } from "@lfd/contracts";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { AuthorizeStopDepositCommand } from "../application/commands/authorize-stop-deposit.command.js";
import { BringStopBackCommand } from "../application/commands/bring-stop-back.command.js";
import { GetDecisionIncidentPhotoQuery } from "../application/queries/get-decision-incident-photo.query.js";
import { GetPendingStopDecisionsQuery } from "../application/queries/get-pending-stop-decisions.query.js";
import { serveStepPhoto } from "./step-photo-http.js";

/**
 * **Le commercial décide** (`documentation/livraisons/plan-a-la-porte.md`,
 * B3, § 10 bis, LB-Q2, LB-Q5).
 *
 * Sous `b2b_companies:write` — LECTURE COMPRISE (`RequirePermission`) : c'est
 * le droit des commerciaux et de l'admin (graine `ROLE_GRANTS` et feuille de
 * réglage `tableau-droits-livraison.md` § 2, relues le 2026-10-01), et la
 * liste ne sert qu'à qui peut y répondre. Le support et la comptabilité, qui
 * lisent les comptes, ne la voient pas. Il n'injecte que les bus.
 */
@Controller("admin/livraison/a-decider")
@AdminSurface("b2b_companies")
export class StopDecisionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequirePermission(STOP_DECISION_PERMISSION)
  pending(): Promise<PendingStopDecisionsView> {
    return this.queries.execute<GetPendingStopDecisionsQuery, PendingStopDecisionsView>(
      new GetPendingStopDecisionsQuery(),
    );
  }

  /**
   * La photo d'un signalement à décider — SEULEMENT celle d'un signalement de
   * cet arrêt, sous une décision vivante (le mur est dans la lecture) ; 404
   * sinon. La route des tournées (`delivery_rounds:read`) n'est pas élargie.
   */
  @Get(":stopId/incidents/:incidentId/photo")
  @RequirePermission(STOP_DECISION_PERMISSION)
  async photo(
    @Param("stopId") stopId: string,
    @Param("incidentId") incidentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetDecisionIncidentPhotoQuery, StoredDocument>(
      new GetDecisionIncidentPhotoQuery(stopId, incidentId),
    );
    return serveStepPhoto(res, photo);
  }

  /** « Autoriser le dépôt cette fois » — 204, même répétée. */
  @Post(":stopId/autoriser-depot")
  @HttpCode(HttpStatus.NO_CONTENT)
  async authorize(
    @StaffUserId() staffUserId: string,
    @Param("stopId") stopId: string,
  ): Promise<void> {
    await this.commands.execute<AuthorizeStopDepositCommand, void>(
      new AuthorizeStopDepositCommand(staffUserId, stopId),
    );
  }

  /** « Rapporter » — 204 ; l'arrêt se clôt « rapporté ». */
  @Post(":stopId/rapporter")
  @HttpCode(HttpStatus.NO_CONTENT)
  async bringBack(
    @StaffUserId() staffUserId: string,
    @Param("stopId") stopId: string,
  ): Promise<void> {
    await this.commands.execute<BringStopBackCommand, void>(
      new BringStopBackCommand(staffUserId, stopId),
    );
  }
}
