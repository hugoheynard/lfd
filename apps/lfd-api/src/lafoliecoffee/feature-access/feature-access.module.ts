import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AddFeatureCompanyExemptionHandler } from "./application/commands/add-feature-company-exemption.handler.js";
import { AddFeatureExemptionHandler } from "./application/commands/add-feature-exemption.handler.js";
import { ClearFeatureOverrideHandler } from "./application/commands/clear-feature-override.handler.js";
import { RemoveFeatureCompanyExemptionHandler } from "./application/commands/remove-feature-company-exemption.handler.js";
import { RemoveFeatureExemptionHandler } from "./application/commands/remove-feature-exemption.handler.js";
import { SetFeatureOverrideHandler } from "./application/commands/set-feature-override.handler.js";
import { FeatureLevelResolver } from "./application/feature-level.resolver.js";
import { GetFeatureAccessBoardHandler } from "./application/queries/get-feature-access-board.handler.js";
import { GetFeatureLevelsHandler } from "./application/queries/get-feature-levels.handler.js";
import { ListExemptibleCompaniesHandler } from "./application/queries/list-exemptible-companies.handler.js";
import { ExemptibleCompaniesReader } from "./domain/ports/exemptible-companies.reader.js";
import { ExemptionCompanyLookup } from "./domain/ports/exemption-company.lookup.js";
import { FeatureCompanyExemptionRepository } from "./domain/ports/feature-company-exemption.repository.js";
import { FeatureAccessBoardReader } from "./domain/ports/feature-access-board.reader.js";
import { FeatureExemptionRepository } from "./domain/ports/feature-exemption.repository.js";
import { FeatureLevelLookup } from "./domain/ports/feature-level.lookup.js";
import { FeatureOverrideRepository } from "./domain/ports/feature-override.repository.js";
import { AdminFeatureAccessController } from "./http/admin-feature-access.controller.js";
import { FeatureAccessController } from "./http/feature-access.controller.js";
import { PrismaExemptibleCompaniesReader } from "./infrastructure/prisma-exemptible-companies.reader.js";
import { PrismaExemptionCompanyLookup } from "./infrastructure/prisma-exemption-company.lookup.js";
import { PrismaFeatureCompanyExemptionRepository } from "./infrastructure/prisma-feature-company-exemption.repository.js";
import { PrismaFeatureAccessBoardReader } from "./infrastructure/prisma-feature-access-board.reader.js";
import { PrismaFeatureExemptionRepository } from "./infrastructure/prisma-feature-exemption.repository.js";
import { PrismaFeatureLevelLookup } from "./infrastructure/prisma-feature-level.lookup.js";
import { PrismaFeatureOverrideRepository } from "./infrastructure/prisma-feature-override.repository.js";

/**
 * **Accès aux fonctionnalités** — le catalogue du code, ses écarts en base, et
 * leur pilotage staff. Plan : `documentation/auth-inscription/plan-inscription-pro-seule.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` : l'auteur d'un écart
 * est figé comme celui d'une certification de KBIS, par le même port.
 *
 * Exporte `FeatureLevelResolver` : la porte du mandat client
 * (`payments/infrastructure/feature-access-customer-mandate-gate.ts`) le
 * consomme, comme l'ouverture du planificateur
 * (`infrastructure/feature-access-planner-access.ts`, reliée par
 * `appBootstrap/recurring-feed.module.ts`). Rien d'autre n'en sort.
 */
@Module({
  imports: [AccountModule],
  controllers: [FeatureAccessController, AdminFeatureAccessController],
  providers: [
    { provide: FeatureOverrideRepository, useClass: PrismaFeatureOverrideRepository },
    { provide: FeatureExemptionRepository, useClass: PrismaFeatureExemptionRepository },
    { provide: FeatureLevelLookup, useClass: PrismaFeatureLevelLookup },
    { provide: FeatureAccessBoardReader, useClass: PrismaFeatureAccessBoardReader },
    {
      provide: FeatureCompanyExemptionRepository,
      useClass: PrismaFeatureCompanyExemptionRepository,
    },
    { provide: ExemptionCompanyLookup, useClass: PrismaExemptionCompanyLookup },
    { provide: ExemptibleCompaniesReader, useClass: PrismaExemptibleCompaniesReader },
    FeatureLevelResolver,
    SetFeatureOverrideHandler,
    ClearFeatureOverrideHandler,
    AddFeatureExemptionHandler,
    RemoveFeatureExemptionHandler,
    AddFeatureCompanyExemptionHandler,
    RemoveFeatureCompanyExemptionHandler,
    GetFeatureAccessBoardHandler,
    ListExemptibleCompaniesHandler,
    GetFeatureLevelsHandler,
  ],
  exports: [FeatureLevelResolver],
})
export class FeatureAccessModule {}
