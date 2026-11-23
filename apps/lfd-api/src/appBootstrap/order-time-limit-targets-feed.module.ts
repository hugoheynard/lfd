import { Global, Module } from "@nestjs/common";

import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { LimitTargetLabelsReader } from "../pim/order-time-limitation/domain/ports/limit-target-labels.reader.js";
import { ProductLineageReader } from "../pim/order-time-limitation/domain/ports/product-lineage.reader.js";
import { PimCatalogueLimitTargetLabels } from "./pim-catalogue-limit-target-labels.js";
import { PimCatalogueProductLineage } from "./pim-catalogue-product-lineage.js";

/**
 * **Ce que les limites de commande demandent au catalogue**, relié :
 * `LimitTargetLabelsReader` — le nom de chaque cible visée — et
 * `ProductLineageReader` — les familles d'une fiche, et si une famille existe.
 * Les limites déclarent, le catalogue implémente.
 *
 * Lié ici et non par un import de module : le catalogue lit les limites, et
 * l'inverse ferait un cycle.
 */
@Global()
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: LimitTargetLabelsReader, useClass: PimCatalogueLimitTargetLabels },
    { provide: ProductLineageReader, useClass: PimCatalogueProductLineage },
  ],
  exports: [LimitTargetLabelsReader, ProductLineageReader],
})
export class OrderTimeLimitTargetsFeedModule {}
