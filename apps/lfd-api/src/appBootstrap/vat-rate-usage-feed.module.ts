import { Global, Module } from "@nestjs/common";

import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { SalesContextsModule } from "../pim/reference/sales-contexts/sales-contexts.module.js";
import { VatRateContextUsageReader } from "../pim/reference/vat-rates/domain/ports/vat-rate-context-usage.reader.js";
import { VatRateUsageReader } from "../pim/reference/vat-rates/domain/ports/vat-rate-usage.reader.js";
import { PimCatalogueVatRateContextUsage } from "./pim-catalogue-vat-rate-context-usage.js";
import { PimCatalogueVatRateUsage } from "./pim-catalogue-vat-rate-usage.js";

/**
 * **Ce que le référentiel des taux demande au catalogue**, relié :
 * `VatRateUsageReader` — combien de familles et de fiches portent un taux,
 * pour refuser d'archiver un taux qui sert — et `VatRateContextUsageReader` —
 * ce même usage par contexte, pour la liste et la portée au journal. Les taux
 * déclarent, le catalogue implémente.
 *
 * Lié ici et non par un import de module : le catalogue importe déjà les taux,
 * et l'inverse ferait un cycle.
 */
@Global()
@Module({
  imports: [CatalogueModule, SalesContextsModule],
  providers: [
    { provide: VatRateUsageReader, useClass: PimCatalogueVatRateUsage },
    { provide: VatRateContextUsageReader, useClass: PimCatalogueVatRateContextUsage },
  ],
  exports: [VatRateUsageReader, VatRateContextUsageReader],
})
export class VatRateUsageFeedModule {}
