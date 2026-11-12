import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { PruneOrderDayChangesCommand } from "../application/commands/prune-order-day-changes.command.js";
import { PruneOrderChangesCommand } from "../application/commands/prune-order-changes.command.js";
import { PruneCompanyChangesCommand } from "../../account/application/commands/prune-company-changes.command.js";
import { PruneCatalogAdminChangesCommand } from "../../catalog/application/commands/prune-catalog-admin-changes.command.js";
import {
  SendSettlementRemindersCommand,
  type SettlementRemindersReport,
} from "../application/commands/send-settlement-reminders.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint **batch** du rappel de règlement (plan
 * `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, Q6, S5) : prévient le
 * commercial des liens de paiement non réglés à l'heure limite.
 *
 * Même porte machine-à-machine que `admin/loyalty/sweep` — le `RecomputeGuard`
 * et son jeton, présentés par le Worker sur un Cron Trigger horaire
 * (`SETTLEMENT_REMINDERS_CRON`, `container/worker.ts`).
 *
 * **La même passe balaie les journaux de version du commerce** — celui des
 * journées (`documentation/caching-usage/version-par-journee.md`, D2), celui
 * de toutes les commandes et celui des comptes clients
 * (`plan-veilleur-unique.md`, § 3.2), celui de l'écran Catalogue
 * (`plan-catalogue-du-back-office.md`, § 3.3) : c'est la
 * passe machine du contexte qui possède `orders`, et un cron de plus serait un
 * réglage Cloudflare pour une suppression de quelques centaines de lignes.
 * Une commande et un handler par balayage — seule la porte est partagée. Le compte
 * rendu reste celui du rappel : sa forme est lue telle quelle, et un balayage
 * de numéros d'affichage n'a rien à y annoncer.
 */
@Controller("admin/orders/settlement-reminders")
@Public()
@UseGuards(RecomputeGuard)
export class SettlementRemindersController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine sous RecomputeGuard : état relu ; rejouée, chaque rappel porte sa clé par commande (la cloche ne sonne qu'une fois) et la purge ne trouve plus rien d'échu",
  )
  async remind(): Promise<SettlementRemindersReport> {
    const report = await this.commands.execute<
      SendSettlementRemindersCommand,
      SettlementRemindersReport
    >(new SendSettlementRemindersCommand());
    await this.commands.execute<PruneOrderDayChangesCommand, number>(
      new PruneOrderDayChangesCommand(),
    );
    await this.commands.execute<PruneOrderChangesCommand, number>(new PruneOrderChangesCommand());
    await this.commands.execute<PruneCompanyChangesCommand, number>(
      new PruneCompanyChangesCommand(),
    );
    await this.commands.execute<PruneCatalogAdminChangesCommand, number>(
      new PruneCatalogAdminChangesCommand(),
    );
    return report;
  }
}
