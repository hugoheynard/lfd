import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { FollowParentCommand } from "../application/commands/follow-parent.command.js";
import { StopFollowingParentCommand } from "../application/commands/stop-following-parent.command.js";

/**
 * **Suivre le tarif du principal** — une décision du commercial (plan
 * `plan-sous-comptes.md`, Q9). Elle est donc derrière le droit de
 * tarification (`b2b_pricing`, le même que `admin-company-pricing.controller`),
 * et non derrière celui de la fiche client : un agent qui corrige une adresse
 * ne fait pas, du même geste, appliquer une mercuriale négociée.
 *
 * Le préfixe est celui de la fiche (`/admin/companies/:companyId`) parce que le
 * geste porte sur ce dossier ; la surface, elle, est la tarification.
 */
@Controller("admin/companies/:companyId/pricing-follow")
@AdminSurface("b2b_pricing")
export class AdminCompanyPricingFollowController {
  constructor(private readonly commands: CommandBus) {}

  /** Le sous-compte suit désormais la mercuriale et les engagements de son principal. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<FollowParentCommand, void>(
      new FollowParentCommand(companyId, "pricing"),
    );
  }

  /** Il cesse de les suivre, et retombe sur les siens. */
  @Post("stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(@Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<StopFollowingParentCommand, void>(
      new StopFollowingParentCommand(companyId, "pricing"),
    );
  }
}
