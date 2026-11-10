import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { CreateBundleHandler } from "./application/commands/create-bundle.handler.js";
import { EditBundlePresentationHandler } from "./application/commands/edit-bundle-presentation.handler.js";
import { ReturnBundleToDraftHandler } from "./application/commands/return-bundle-to-draft.handler.js";
import { SaveBundleCompositionHandler } from "./application/commands/save-bundle-composition.handler.js";
import { WithdrawBundleHandler } from "./application/commands/withdraw-bundle.handler.js";
import { GetBundleHandler } from "./application/queries/get-bundle.handler.js";
import { ListBundlesHandler } from "./application/queries/list-bundles.handler.js";
import { SearchBundleChoicesHandler } from "./application/queries/search-bundle-choices.handler.js";
import { BundleChoiceCatalogue } from "./domain/ports/bundle-choice.catalogue.js";
import { BundleChoiceSearch } from "./domain/ports/bundle-choice.search.js";
import { BundleReader } from "./domain/ports/bundle.reader.js";
import { BundleRepository } from "./domain/ports/bundle.repository.js";
import { AdminBundlesController } from "./http/admin-bundles.controller.js";
import { CatalogBackedBundleChoiceCatalogue } from "./infrastructure/catalog-backed-bundle-choice.catalogue.js";
import { CatalogBackedBundleChoiceSearch } from "./infrastructure/catalog-backed-bundle-choice.search.js";
import { PrismaBundleReader } from "./infrastructure/prisma-bundle.reader.js";
import { PrismaBundleRepository } from "./infrastructure/prisma-bundle.repository.js";

/**
 * **Les formules** — le contexte qui les tient, entièrement au commerce (D7,
 * Q1 : recommandation retenue le 2026-10-19 ; `documentation/formules/plan-les-formules.md`).
 *
 * Lot F2a : la composition seule. Il n'exporte rien — aucune boutique, aucun
 * panier, aucune commande ne lit une formule dans ce lot. Il ne lit le
 * catalogue que par les ports que `CatalogModule` publie
 * (`CatalogAdminReader`, `CatalogReader`).
 */
@Module({
  imports: [CatalogModule],
  controllers: [AdminBundlesController],
  providers: [
    { provide: BundleRepository, useClass: PrismaBundleRepository },
    { provide: BundleReader, useClass: PrismaBundleReader },
    { provide: BundleChoiceCatalogue, useClass: CatalogBackedBundleChoiceCatalogue },
    { provide: BundleChoiceSearch, useClass: CatalogBackedBundleChoiceSearch },
    CreateBundleHandler,
    EditBundlePresentationHandler,
    SaveBundleCompositionHandler,
    WithdrawBundleHandler,
    ReturnBundleToDraftHandler,
    ListBundlesHandler,
    GetBundleHandler,
    SearchBundleChoicesHandler,
  ],
})
export class BundlesModule {}
