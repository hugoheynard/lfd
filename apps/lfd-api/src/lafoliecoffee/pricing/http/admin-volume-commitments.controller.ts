import {
  carryOverDecisionPayloadSchema,
  createVolumeCommitmentPayloadSchema,
  pricingReasonPayloadSchema,
  type CarryOverDecisionPayload,
  type CreateVolumeCommitmentPayload,
  type PricingReasonPayload,
  type VolumeCommitmentView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CloseVolumeCommitmentCommand } from "../application/commands/close-volume-commitment.command.js";
import { SignVolumeCommitmentCommand } from "../application/commands/sign-volume-commitment.command.js";
import { CarryOverVolumeCommitmentCommand } from "../application/commands/carry-over-volume-commitment.command.js";
import { ListVolumeCommitmentsQuery } from "../application/queries/list-volume-commitments.query.js";
import type { CreatedIdResponse } from "@lfd/contracts";

/**
 * **Les engagements de volume**, côté back-office.
 *
 * Trois gestes seulement, et l'absence du quatrième est la décision : on signe,
 * on suit, on clôt. On ne **modifie** pas. Changer la période ou le volume visé
 * d'un engagement en cours déplacerait le palier de commandes déjà facturées,
 * dont la trace, elle, ne bouge pas — l'écran raconterait alors autre chose que
 * la facture. Pour corriger, on clôt et on signe.
 */
@Controller("admin/pricing/commitments")
@AdminSurface("b2b_pricing")
export class AdminVolumeCommitmentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le suivi d'un client : ses engagements, et le volume atteint sur chacun. */
  @Get()
  async list(@Query("companyId") companyId: string): Promise<readonly VolumeCommitmentView[]> {
    return this.queries.execute<ListVolumeCommitmentsQuery, readonly VolumeCommitmentView[]>(
      new ListVolumeCommitmentsQuery(companyId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sign(
    @Body(new ZodBody(createVolumeCommitmentPayloadSchema)) payload: CreateVolumeCommitmentPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<SignVolumeCommitmentCommand, string>(
      new SignVolumeCommitmentCommand(payload, staffUserId),
    );
    return { id };
  }

  /**
   * **Clore.** Sans effet rétroactif : les commandes passées gardent le palier
   * qu'elles ont mérité. La période redevient libre, rien n'est révisé.
   */
  @Post(":id/close")
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CloseVolumeCommitmentCommand, void>(
      new CloseVolumeCommitmentCommand(id, payload.reason, staffUserId),
    );
  }

  /**
   * **Reporter** l'engagement sur la référence née d'un détachement
   * (`plan-report-apres-detachement.md`, R4) : la même promesse, signée sur la
   * nouvelle. L'ancien court jusqu'à sa fin.
   */
  @Post(":id/carry-over")
  @HttpCode(HttpStatus.CREATED)
  async carryOver(
    @Param("id") id: string,
    @Body(new ZodBody(carryOverDecisionPayloadSchema)) payload: CarryOverDecisionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const signed = await this.commands.execute<CarryOverVolumeCommitmentCommand, string>(
      new CarryOverVolumeCommitmentCommand(
        id,
        payload.fromSku,
        payload.toSku,
        payload.reason,
        staffUserId,
      ),
    );
    return { id: signed };
  }
}
