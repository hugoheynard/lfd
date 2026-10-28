import { Module } from "@nestjs/common";

import { CreateBatchShortcutHandler } from "./application/commands/create-batch-shortcut.handler.js";
import { RemoveBatchShortcutHandler } from "./application/commands/remove-batch-shortcut.handler.js";
import { UpdateBatchShortcutHandler } from "./application/commands/update-batch-shortcut.handler.js";
import { GetBatchShortcutsSettingsHandler } from "./application/queries/get-batch-shortcuts-settings.handler.js";
import { GetWorkshopShortcutsHandler } from "./application/queries/get-workshop-shortcuts.handler.js";
import { BatchShortcutReader } from "./domain/ports/batch-shortcut.reader.js";
import { BatchShortcutRepository } from "./domain/ports/batch-shortcut.repository.js";
import { ProductionBatchShortcutsController } from "./http/production-batch-shortcuts.controller.js";
import { ProductionWorkshopShortcutsController } from "./http/production-workshop-shortcuts.controller.js";
import { PrismaBatchShortcutReader } from "./infrastructure/prisma-batch-shortcut.reader.js";
import { PrismaBatchShortcutRepository } from "./infrastructure/prisma-batch-shortcut.repository.js";

/**
 * **Les raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S1-S2) — un
 * module à part de `ProductionModule`, qui passe déjà les 300 lignes : rien
 * de la journée ne les lit, et ils ne lisent rien d'elle.
 *
 * Les articles vendables viennent du canal `channels/commerce/`
 * (`SellableArticlesReader`), relié par `ProductionFeedModule`, global.
 */
@Module({
  controllers: [ProductionBatchShortcutsController, ProductionWorkshopShortcutsController],
  providers: [
    CreateBatchShortcutHandler,
    UpdateBatchShortcutHandler,
    RemoveBatchShortcutHandler,
    GetBatchShortcutsSettingsHandler,
    GetWorkshopShortcutsHandler,
    { provide: BatchShortcutRepository, useClass: PrismaBatchShortcutRepository },
    { provide: BatchShortcutReader, useClass: PrismaBatchShortcutReader },
  ],
})
export class ProductionBatchShortcutsModule {}
