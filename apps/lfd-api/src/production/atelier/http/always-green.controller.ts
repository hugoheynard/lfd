import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  type AlwaysGreenRoundReport,
  RunAlwaysGreenRoundCommand,
} from "../application/commands/run-always-green-round.command.js";

/** Le tour a toujours une réponse : son compte rendu. */
const OK = 200;

/**
 * Endpoint **machine** de la fournée automatique (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.7). Même porte que
 * `admin/production/auto-close` : le `RecomputeGuard` et son jeton, présentés
 * par le Worker sur le cron de rafraîchissement, toutes les cinq minutes
 * (`container/worker.ts`). Pas de droit staff.
 */
@Controller("admin/production/tracking/always-green")
@Public()
@UseGuards(RecomputeGuard)
export class AlwaysGreenController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "appelée par le cron sous RecomputeGuard : chaque fournée automatique porte l'id auto-<jour>-<sku>-<n>, n le nombre de fournées de la ligne, relu sous le verrou de la journée — un second passage sur le même état rejoue la même charge, que l'agrégat reconnaît sans écrire",
  )
  @HttpCode(OK)
  async run(): Promise<AlwaysGreenRoundReport> {
    return this.commands.execute<RunAlwaysGreenRoundCommand, AlwaysGreenRoundReport>(
      new RunAlwaysGreenRoundCommand(),
    );
  }
}
