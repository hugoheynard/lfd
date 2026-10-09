import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { AnonymizeCustomerRequestsCommand } from "../application/commands/anonymize-customer-requests.command.js";

/** Le compte rendu du passage : un compte, jamais une donnée. */
export interface ContactAnonymizationSweepReport {
  readonly anonymized: number;
}

/**
 * Endpoint **batch** de l'anonymisation des demandes clients conservées
 * depuis douze mois — photos supprimées du stockage. Le chemin garde son nom
 * d'origine (`admin/contact/messages/…`) : le cron de `container/worker.ts`
 * l'appelle tel quel (relu le 2026-10-09). Même porte machine-à-machine que
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
    const anonymized = await this.commands.execute<AnonymizeCustomerRequestsCommand, number>(
      new AnonymizeCustomerRequestsCommand(),
    );
    return { anonymized };
  }
}
