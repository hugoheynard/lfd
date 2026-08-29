import {
  createVolumeCommitmentPayloadSchema,
  pricingReasonPayloadSchema,
  type CreateVolumeCommitmentPayload,
  type PricingReasonPayload,
  type VolumeCommitmentView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffSub } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CloseVolumeCommitmentCommand,
  SignVolumeCommitmentCommand,
} from "../application/commands/volume-commitment.handlers.js";
import { VolumeCommitmentsQuery } from "../application/queries/volume-commitments.query.js";
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
@AdminSurface("settings")
export class AdminVolumeCommitmentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly commitments: VolumeCommitmentsQuery,
  ) {}

  /** Le suivi d'un client : ses engagements, et le volume atteint sur chacun. */
  @Get()
  async list(@Query("companyId") companyId: string): Promise<readonly VolumeCommitmentView[]> {
    return this.commitments.forCompany(companyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async sign(
    @Body(new ZodBody(createVolumeCommitmentPayloadSchema)) payload: CreateVolumeCommitmentPayload,
    @StaffSub() staffSub: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<SignVolumeCommitmentCommand, string>(
      new SignVolumeCommitmentCommand(payload, staffSub),
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
    @StaffSub() staffSub: string,
  ): Promise<void> {
    await this.commands.execute<CloseVolumeCommitmentCommand, void>(
      new CloseVolumeCommitmentCommand(id, payload.reason, staffSub),
    );
  }
}
