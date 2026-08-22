import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../../platform/auth/recompute.guard.js";
import {
  SweepOrphanMediaCommand,
  type OrphanSweepReport,
} from "../application/sweep-orphan-media.js";

/**
 * Endpoint **batch** du ramassage de visuels orphelins, déclenché une fois par
 * jour par un Cloudflare Cron Trigger.
 *
 * `RecomputeGuard` porte mal son nom : c'est **la** porte machine-à-machine du
 * backend, nommée d'après son premier usage. La réutiliser plutôt que d'ouvrir
 * une seconde porte avec son propre jeton est le bon échange — un secret de
 * plus, c'est un secret de plus à faire tourner, et cette porte protège déjà
 * exactement le même genre de trafic.
 *
 * Rend le rapport du passage : c'est la seule observabilité du cron, et
 * notamment le drapeau `capped`, qui dit qu'il reste du travail.
 */
@Controller("admin/media/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class MediaSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<OrphanSweepReport> {
    return this.commands.execute<SweepOrphanMediaCommand, OrphanSweepReport>(
      new SweepOrphanMediaCommand(),
    );
  }
}
