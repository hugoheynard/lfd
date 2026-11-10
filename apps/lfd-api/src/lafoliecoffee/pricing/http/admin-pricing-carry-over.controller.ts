import {
  carryOverDecisionPayloadSchema,
  type CarryOverDecisionPayload,
  type CreatedIdResponse,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CarryOverPriceRuleCommand } from "../application/commands/carry-over-price-rule.command.js";
import { CarryOverVolumeLadderCommand } from "../application/commands/carry-over-volume-ladder.command.js";

/**
 * **Reporter une règle ou un barème** sur la référence née d'un détachement
 * (`plan-report-apres-detachement.md`, R1, R3).
 *
 * Sous `b2b_pricing`, la surface de `AdminPricingController` qui pose ces
 * deux familles : reporter, c'est poser (§ 4). Un contrôleur à part parce que
 * celui-là dépasse déjà la taille d'un fichier ; la garde, elle, est la même —
 * jamais celle du panneau des décisions, et jamais pour un plancher.
 */
@Controller("admin/pricing")
@AdminSurface("b2b_pricing")
export class AdminPricingCarryOverController {
  constructor(private readonly commands: CommandBus) {}

  /** Rend l'identifiant de la règle posée sur `toSku`. */
  @Post("rules/:id/carry-over")
  @HttpCode(HttpStatus.CREATED)
  async carryOverRule(
    @Param("id") id: string,
    @Body(new ZodBody(carryOverDecisionPayloadSchema)) payload: CarryOverDecisionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const posed = await this.commands.execute<CarryOverPriceRuleCommand, string>(
      new CarryOverPriceRuleCommand(
        id,
        payload.fromSku,
        payload.toSku,
        payload.reason,
        staffUserId,
      ),
    );
    return { id: posed };
  }

  /** Rend l'identifiant du barème posé sur `toSku`. */
  @Post("volume-ladders/:id/carry-over")
  @HttpCode(HttpStatus.CREATED)
  async carryOverLadder(
    @Param("id") id: string,
    @Body(new ZodBody(carryOverDecisionPayloadSchema)) payload: CarryOverDecisionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const posed = await this.commands.execute<CarryOverVolumeLadderCommand, string>(
      new CarryOverVolumeLadderCommand(
        id,
        payload.fromSku,
        payload.toSku,
        payload.reason,
        staffUserId,
      ),
    );
    return { id: posed };
  }
}
