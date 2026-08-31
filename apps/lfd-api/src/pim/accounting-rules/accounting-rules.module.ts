import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { ReadAccountingRulesHandler } from "./application/read-accounting-rules.js";
import { SetProPriceRatioHandler } from "./application/set-pro-price-ratio.js";
import { AccountingRulesRepository } from "./domain/ports/accounting-rules.repository.js";
import { AccountingRulesController } from "./http/accounting-rules.controller.js";
import { PrismaAccountingRulesRepository } from "./infrastructure/prisma-accounting-rules.repository.js";

/**
 * Contexte **accounting-rules** — les décisions comptables globales de la
 * maison.
 *
 * Il n'en porte qu'une : le rapport prix pro TTC / prix public TTC. Un module à
 * part plutôt qu'un champ de plus dans `vat-rates/` — un taux de TVA est imposé
 * de l'extérieur, un rapport commercial est décidé par la maison. Les ranger
 * ensemble parce qu'ils partagent un écran mélangerait la loi et la politique.
 *
 * Il **exporte** son dépôt : la tranche 4 en aura besoin pour dériver le prix
 * professionnel au moment du push vers la plateforme.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [AccountingRulesController],
  providers: [
    { provide: AccountingRulesRepository, useClass: PrismaAccountingRulesRepository },
    ReadAccountingRulesHandler,
    SetProPriceRatioHandler,
  ],
  exports: [AccountingRulesRepository],
})
export class AccountingRulesModule {}
