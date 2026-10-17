import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { AudienceSwitchAppliedView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ApplyAudienceSwitchCommand } from "../application/apply-audience-switch.js";

/**
 * **Appliquer la bascule vers l'audience** — `POST
 * /pim/channels/b2b/audience-switch` (2b1), à côté de son aperçu
 * (`GET /pim/channels/b2b/audience-switch-preview`).
 *
 * Murée par `@AdminSurface("pim_catalog")` : un `POST`, donc la permission
 * d'ÉCRITURE du référentiel — le geste change le statut de fiches.
 *
 * La bascule est un geste de déploiement, pas un réglage du quotidien.
 */
@AdminSurface("pim_catalog")
@Controller("audience-switch")
export class AudienceSwitchController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  apply(): Promise<AudienceSwitchAppliedView> {
    return this.commands.execute<ApplyAudienceSwitchCommand, AudienceSwitchAppliedView>(
      new ApplyAudienceSwitchCommand(),
    );
  }
}
