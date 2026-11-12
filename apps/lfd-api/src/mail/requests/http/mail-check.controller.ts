import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  CheckMailDeliveryCommand,
  type MailCheckResult,
} from "../application/check-mail-delivery.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint du **contrôle de mise en service du courrier**, appelé par
 * `deploy_lfd_api.yml` après `wrangler deploy` (cf. `CheckMailDeliveryHandler`).
 * Sa route ne change pas en quittant `platform/mailer/` (lot S2h) : le
 * workflow l'appelle par son chemin. La porte machine-à-machine est celle du
 * balayeur — le `RecomputeGuard` et son jeton.
 */
@Controller("admin/ops/mail-check")
@Public()
@UseGuards(RecomputeGuard)
export class MailCheckController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "appelée par la machine (RecomputeGuard) une fois après un déploiement : chaque appel est un contrôle et envoie un essai de plus à l'adresse de l'administrateur, voulu ; rien d'autre ne s'écrit",
  )
  @HttpCode(200)
  check(): Promise<MailCheckResult> {
    return this.commands.execute<CheckMailDeliveryCommand, MailCheckResult>(
      new CheckMailDeliveryCommand(),
    );
  }
}
