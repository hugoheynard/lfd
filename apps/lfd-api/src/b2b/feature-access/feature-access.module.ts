import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AddFeatureExemptionHandler } from "./application/commands/add-feature-exemption.handler.js";
import { ClearFeatureOverrideHandler } from "./application/commands/clear-feature-override.handler.js";
import { RemoveFeatureExemptionHandler } from "./application/commands/remove-feature-exemption.handler.js";
import { SetFeatureOverrideHandler } from "./application/commands/set-feature-override.handler.js";
import { FeatureLevelResolver } from "./application/feature-level.resolver.js";
import { GetFeatureAccessBoardHandler } from "./application/queries/get-feature-access-board.handler.js";
import { GetFeatureLevelsHandler } from "./application/queries/get-feature-levels.handler.js";
import { GetMyFeatureLevelsHandler } from "./application/queries/get-my-feature-levels.handler.js";
import { FeatureAccessBoardReader } from "./domain/ports/feature-access-board.reader.js";
import { FeatureExemptionRepository } from "./domain/ports/feature-exemption.repository.js";
import { FeatureLevelLookup } from "./domain/ports/feature-level.lookup.js";
import { FeatureOverrideRepository } from "./domain/ports/feature-override.repository.js";
import { AdminFeatureAccessController } from "./http/admin-feature-access.controller.js";
import { FeatureAccessController } from "./http/feature-access.controller.js";
import { MyFeatureAccessController } from "./http/my-feature-access.controller.js";
import { PrismaFeatureAccessBoardReader } from "./infrastructure/prisma-feature-access-board.reader.js";
import { PrismaFeatureExemptionRepository } from "./infrastructure/prisma-feature-exemption.repository.js";
import { PrismaFeatureLevelLookup } from "./infrastructure/prisma-feature-level.lookup.js";
import { PrismaFeatureOverrideRepository } from "./infrastructure/prisma-feature-override.repository.js";

/**
 * **Accès aux fonctionnalités** — le catalogue du code, ses écarts en base, et
 * leur pilotage staff. Plan : `documentation/b2b/plan-inscription-pro-seule.md`.
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` : l'auteur d'un écart
 * est figé comme celui d'une certification de KBIS, par le même port.
 *
 * Exporte `FeatureLevelResolver` : `FeatureAccessGuard`, enregistrée à la racine
 * de composition, le consomme. Rien d'autre n'en sort.
 */
@Module({
  imports: [AccountModule],
  controllers: [FeatureAccessController, MyFeatureAccessController, AdminFeatureAccessController],
  providers: [
    { provide: FeatureOverrideRepository, useClass: PrismaFeatureOverrideRepository },
    { provide: FeatureExemptionRepository, useClass: PrismaFeatureExemptionRepository },
    { provide: FeatureLevelLookup, useClass: PrismaFeatureLevelLookup },
    { provide: FeatureAccessBoardReader, useClass: PrismaFeatureAccessBoardReader },
    FeatureLevelResolver,
    SetFeatureOverrideHandler,
    ClearFeatureOverrideHandler,
    AddFeatureExemptionHandler,
    RemoveFeatureExemptionHandler,
    GetFeatureAccessBoardHandler,
    GetFeatureLevelsHandler,
    GetMyFeatureLevelsHandler,
  ],
  exports: [FeatureLevelResolver],
})
export class FeatureAccessModule {}
