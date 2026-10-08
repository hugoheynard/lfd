import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  RunCollectionAutopilotCommand,
  type CollectionAutopilotReport,
} from "../application/commands/run-collection-autopilot.command.js";

/**
 * Endpoint **machine** de la constitution automatique (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA3).
 *
 * Même porte que `admin/orders/settlement-reminders` — le `RecomputeGuard`
 * et son jeton, présentés par le Worker sur un Cron Trigger horaire PROPRE
 * (`COLLECTION_AUTOPILOT_CRON`, `container/worker.ts`) : un cron partagé avec
 * les relances aurait lié deux rythmes qui n'ont rien à voir (`vitruve`, § 8).
 */
@Controller("admin/accounting/collection/autopilot")
@Public()
@UseGuards(RecomputeGuard)
export class CollectionAutopilotController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  run(): Promise<CollectionAutopilotReport> {
    return this.commands.execute<RunCollectionAutopilotCommand, CollectionAutopilotReport>(
      new RunCollectionAutopilotCommand(),
    );
  }
}
