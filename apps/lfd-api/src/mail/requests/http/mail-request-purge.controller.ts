import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  type MailPurgeReport,
  PurgeSettledMailRequestsCommand,
} from "../application/purge-settled-mail-requests.command.js";

/**
 * Endpoint **batch** de la purge du suivi des envois (`plan-service-e-mails.md`,
 * § 7). Même porte machine-à-machine que les autres purges : le
 * `RecomputeGuard` et son jeton. Appelé par le cron nocturne
 * `QUALITY_UPLOAD_SWEEP_CRON` (`container/worker.ts`). Le compte rendu dit le
 * mode : en `dry-run` (défaut), rien n'est supprimé.
 */
@Controller("admin/mail/requests/purge")
@Public()
@UseGuards(RecomputeGuard)
export class MailRequestPurgeController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  purge(): Promise<MailPurgeReport> {
    return this.commands.execute<PurgeSettledMailRequestsCommand, MailPurgeReport>(
      new PurgeSettledMailRequestsCommand(),
    );
  }
}
