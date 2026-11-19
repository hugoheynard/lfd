import { Global, Module } from "@nestjs/common";

import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { SalesContextRatingsReader } from "../pim/reference/sales-contexts/domain/ports/sales-context-ratings.reader.js";
import { SalesContextUsageReader } from "../pim/reference/sales-contexts/domain/ports/sales-context-usage.reader.js";
import { PimCatalogueSalesContextRatings } from "./pim-catalogue-sales-context-ratings.js";
import { PimCatalogueSalesContextUsage } from "./pim-catalogue-sales-context-usage.js";

/**
 * **Ce que le registre des contextes de vente demande au catalogue**, relié :
 * combien de taux sont réglés sur un contexte (l'archive) et sur chacun (la
 * liste). Le registre déclare, le catalogue implémente.
 *
 * Lié ici et non par un import de module : le catalogue importe déjà le
 * registre, et l'inverse ferait un cycle.
 */
@Global()
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: SalesContextUsageReader, useClass: PimCatalogueSalesContextUsage },
    { provide: SalesContextRatingsReader, useClass: PimCatalogueSalesContextRatings },
  ],
  exports: [SalesContextUsageReader, SalesContextRatingsReader],
})
export class SalesContextUsageFeedModule {}
