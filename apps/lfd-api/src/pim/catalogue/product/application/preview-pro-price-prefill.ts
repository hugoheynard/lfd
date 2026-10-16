import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProPricePrefillPreviewView } from "@lfd/pim-contracts";

import { AccountingRulesReader } from "../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { prefillMismatches } from "../domain/services/pro-price-prefill.js";
import { loadPrefillPlan } from "./pro-price-prefill-support.js";

export class PreviewProPricePrefillQuery {}

/**
 * **L'aperçu du pré-remplissage** (`dryRun`, lot P, P5) — lecture seule.
 *
 * Rend chaque déclinaison avec le HT servi aujourd'hui et le HT que l'`apply`
 * écrirait, et le nombre d'écarts (sous `ratio_ttc` seulement, lot S) : Hugo
 * relit cette liste AVANT d'écrire, puis avant « Passer au prix saisi ».
 */
@QueryHandler(PreviewProPricePrefillQuery)
export class PreviewProPricePrefillHandler implements IQueryHandler<
  PreviewProPricePrefillQuery,
  ProPricePrefillPreviewView
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly catalogue: CatalogueReader,
    private readonly accounting: AccountingRulesReader,
  ) {}

  async execute(): Promise<ProPricePrefillPreviewView> {
    const plan = await loadPrefillPlan(this.products, this.catalogue, this.accounting);
    return {
      method: plan.policy.method,
      ratioBp: plan.ratioBp,
      rows: plan.rows,
      toPrefill: plan.rows.filter((row) => row.status === "to_prefill").length,
      mismatches: prefillMismatches(plan.rows),
    };
  }
}
