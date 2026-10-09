import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { AnonymizeHandledContactMessagesCommand } from "../application/commands/anonymize-handled-contact-messages.command.js";

/** Le compte rendu du passage : un compte, jamais une donnée. */
export interface ContactAnonymizationSweepReport {
  readonly anonymized: number;
}

/**
 * Endpoint **batch** de l'anonymisation des messages « Nous écrire » traités
 * depuis douze mois. Même porte machine-à-machine que
 * `admin/livraison/positions/sweep` : le `RecomputeGuard` et son jeton.
 * Appelé par le cron nocturne `QUALITY_UPLOAD_SWEEP_CRON` (`container/worker.ts`).
 */
@Controller("admin/contact/messages/anonymization/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class ContactAnonymizationSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<ContactAnonymizationSweepReport> {
    const anonymized = await this.commands.execute<AnonymizeHandledContactMessagesCommand, number>(
      new AnonymizeHandledContactMessagesCommand(),
    );
    return { anonymized };
  }
}
