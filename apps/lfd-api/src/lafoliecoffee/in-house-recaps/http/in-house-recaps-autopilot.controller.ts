import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  IssueInHouseRecapsCommand,
  type InHouseRecapsReport,
} from "../application/commands/issue-in-house-recaps.command.js";

/**
 * Endpoint **machine** du récapitulatif mensuel des BL des restaurants maison
 * (`plan-restaurants-maison.md`, D9) : présenté par le Worker sur son cron
 * PROPRE (`IN_HOUSE_RECAPS_CRON`, `30 22,23 * * *` UTC — 00h30 à Paris l'été
 * pour l'un, l'hiver pour l'autre), avec le jeton du `RecomputeGuard`.
 *
 * Chaque passage traite le dernier mois clos à Paris : le 1er, il émet ; les
 * autres jours, il se tait sur les issues déjà rangées — et rattrape un 1er
 * manqué. Pas de branche dans l'automatisme des factures.
 */
@Controller("admin/in-house-recaps/run")
@Public()
@UseGuards(RecomputeGuard)
export class InHouseRecapsAutopilotController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : une issue par (payeur, mois), tenue par l'unicité de in_house_recap_run, et un BL dans un seul récapitulatif non remplacé (in_house_recap_note_covered_once)",
  )
  run(): Promise<InHouseRecapsReport> {
    return this.commands.execute<IssueInHouseRecapsCommand, InHouseRecapsReport>(
      new IssueInHouseRecapsCommand(),
    );
  }
}
