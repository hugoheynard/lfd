import { Injectable } from "@nestjs/common";

import {
  CategoryRateUsageReader,
  type RateContextTally,
} from "../pim/catalogue/category/domain/ports/category-rate-usage.reader.js";
import { ProductRateUsageReader } from "../pim/catalogue/product/domain/ports/product-rate-usage.reader.js";
import { SalesContextKeysReader } from "../pim/reference/sales-contexts/domain/ports/sales-context-keys.reader.js";
import {
  VatRateContextUsageReader,
  type VatRateUsage,
} from "../pim/reference/vat-rates/domain/ports/vat-rate-context-usage.reader.js";

/**
 * Ce que le CATALOGUE répond au référentiel des taux : combien de familles et
 * de fiches visent chaque taux, par clé de contexte. Il ne lit aucune table :
 * il additionne ce que la famille et la fiche publient, et nomme les contextes
 * par la lecture que le registre publie.
 *
 * Les dérogations des fiches comptent autant que les familles : un taux visé
 * par une seule fiche ne s'archive pas plus qu'un taux visé par une famille
 * entière, et l'écran doit le dire avant le clic.
 */
@Injectable()
export class PimCatalogueVatRateContextUsage extends VatRateContextUsageReader {
  constructor(
    private readonly categories: CategoryRateUsageReader,
    private readonly products: ProductRateUsageReader,
    private readonly contexts: SalesContextKeysReader,
  ) {
    super();
  }

  async usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>> {
    const [byFamily, byProduct, keyById] = await Promise.all([
      this.categories.tallies(),
      this.products.tallies(),
      this.contexts.keysById(),
    ]);
    return summed([...byFamily, ...byProduct], keyById);
  }
}

/**
 * On ADDITIONNE : familles et fiches visent le même taux dans le même
 * contexte, et le compte dit combien de décisions en dépendent. Une ligne dont
 * le contexte est inconnu ne se compte pas : la nommer « inconnu » ferait
 * apparaître un usage que l'écran ne sait pas expliquer.
 */
function summed(
  tallies: readonly RateContextTally[],
  keyById: ReadonlyMap<string, string>,
): ReadonlyMap<string, VatRateUsage> {
  const usage = new Map<string, Record<string, number>>();
  for (const tally of tallies) {
    const key = keyById.get(tally.contextId);
    if (key === undefined) {
      continue;
    }
    const current = usage.get(tally.vatRateId) ?? {};
    current[key] = (current[key] ?? 0) + tally.count;
    usage.set(tally.vatRateId, current);
  }
  return usage;
}
