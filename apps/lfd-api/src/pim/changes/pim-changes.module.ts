import { Module } from "@nestjs/common";

import { DayVersionsModule } from "../../platform/day-versions/day-versions.module.js";
import { PimDatabaseModule } from "../infra/database/pim-database.module.js";
import { PimContents, VersionedPimContents } from "./application/pim-contents.js";
import { PimVersionSource } from "./application/pim-version.source.js";
import { PrunePimChangesHandler } from "./application/prune-pim-changes.js";
import { PimChangeVersionReader } from "./domain/ports/pim-change-version.reader.js";
import { PimChangePruner } from "./domain/ports/pim-change.pruner.js";
import { PimChangeSweepController } from "./http/pim-change-sweep.controller.js";
import { PrismaPimChangeVersionReader } from "./infrastructure/prisma-pim-change-version.reader.js";
import { PrismaPimChangePruner } from "./infrastructure/prisma-pim-change.pruner.js";

/**
 * Contexte **changes** — le numéro `pim` du référentiel
 * (`documentation/caching-usage/plan-lectures-du-pim.md`, § 4).
 *
 * Il tient le journal `pim.pim_change` (lu, balayé — jamais écrit : ses
 * lignes naissent des déclencheurs), la source globale `pim` que
 * `appBootstrap/day-version-sources.module.ts` relie au registre, et
 * {@link PimContents}, la porte par laquelle les lectures du référentiel
 * servent leur contenu depuis l'objet tant que le numéro ne bouge pas.
 *
 * Hors de l'arbre de routes `/pim` : sa seule route est le balayage machine,
 * sous `admin/`, comme les autres balayages.
 */
@Module({
  imports: [PimDatabaseModule, DayVersionsModule],
  controllers: [PimChangeSweepController],
  providers: [
    { provide: PimChangeVersionReader, useClass: PrismaPimChangeVersionReader },
    { provide: PimChangePruner, useClass: PrismaPimChangePruner },
    { provide: PimContents, useClass: VersionedPimContents },
    PimVersionSource,
    PrunePimChangesHandler,
  ],
  exports: [PimContents, PimVersionSource],
})
export class PimChangesModule {}
