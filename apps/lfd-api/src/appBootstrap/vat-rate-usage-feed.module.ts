import { Global, Module } from "@nestjs/common";

import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { VatRateUsageReader } from "../pim/reference/vat-rates/domain/ports/vat-rate-usage.reader.js";
import { PimCatalogueVatRateUsage } from "./pim-catalogue-vat-rate-usage.js";

/**
 * **Ce que le référentiel des taux demande au catalogue**, relié :
 * `VatRateUsageReader` — combien de familles et de fiches portent un taux,
 * pour refuser d'archiver un taux qui sert. Les taux déclarent, le catalogue
 * implémente.
 *
 * Lié ici et non par un import de module : le catalogue importe déjà les taux,
 * et l'inverse ferait un cycle.
 */
@Global()
@Module({
  imports: [CatalogueModule],
  providers: [{ provide: VatRateUsageReader, useClass: PimCatalogueVatRateUsage }],
  exports: [VatRateUsageReader],
})
export class VatRateUsageFeedModule {}
