import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ProPricePrefillRowView } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { AccountingRulesReader } from "../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { CatalogueReader } from "../../shared/domain/ports/catalogue-reader.js";
import type { Product } from "../domain/entities/product.js";
import { ProPricePrefillMismatchError } from "../domain/errors/product-errors.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { prefillMismatches } from "../domain/services/pro-price-prefill.js";
import { ProPriceHt } from "../domain/value-objects/pro-price-ht.js";
import { namedVariant } from "./product-support.js";
import { loadPrefillPlan } from "./pro-price-prefill-support.js";

export class ApplyProPricePrefillCommand {}

/**
 * **Écrit le pré-remplissage** (`apply`, lot P, P5). Ne rend rien (CQRS) : la
 * route relit l'aperçu, qui ne compte plus de lignes `to_prefill`.
 *
 * Le plan est **recalculé ici**, jamais reçu de l'écran : un aperçu vieux de
 * dix minutes ne décide pas de ce qu'on écrit. Sous `ratio_ttc`, un seul écart
 * entre HT servi et HT pré-rempli refuse TOUT, avant la première écriture.
 * Sous `entered` (lot S), il n'y a pas d'écart à contrôler : les déclinaisons
 * écrites deviennent vendables aux pros, ce que l'aperçu a dit et que l'écran
 * fait confirmer.
 *
 * L'écriture passe par l'agrégat (`Product.prefillProPrice`), qui n'écrit que
 * sur une déclinaison à tarif propre et sans saisie ; une fiche par
 * transaction, un fait `product.pro_price_prefilled` par déclinaison, puis
 * l'émetteur du lot 2a (sans effet tant que les faits sont fermés).
 *
 * @throws {ProPricePrefillMismatchError} au moins un écart.
 */
@CommandHandler(ApplyProPricePrefillCommand)
export class ApplyProPricePrefillHandler implements ICommandHandler<
  ApplyProPricePrefillCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly catalogue: CatalogueReader,
    private readonly accounting: AccountingRulesReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(): Promise<void> {
    const plan = await loadPrefillPlan(this.products, this.catalogue, this.accounting);
    const mismatches = prefillMismatches(plan.rows);
    if (mismatches > 0) {
      throw new ProPricePrefillMismatchError(mismatches);
    }
    for (const product of plan.products) {
      const rows = plan.rows.filter(
        (row) => row.productId === product.id && row.status === "to_prefill",
      );
      if (rows.length > 0) {
        await this.prefill(product, rows, plan.ratioBp);
      }
    }
  }

  /** Une fiche, une transaction : ses déclinaisons, leurs faits, l'émission. */
  private async prefill(
    product: Product,
    rows: readonly ProPricePrefillRowView[],
    ratioBp: number,
  ): Promise<void> {
    await this.uow.run(async () => {
      let ticket: WriteTicket | null = null;
      for (const row of rows) {
        if (row.prefilledHtMillicents === null || row.vatPercent === null) {
          continue;
        }
        const price = ProPriceHt.fromMillicents(row.prefilledHtMillicents);
        if (!product.prefillProPrice(row.variantId, price)) {
          continue;
        }
        const snapshot = product.snapshot();
        ticket = await this.journal.trace({
          type: PIM_EVENTS.productProPricePrefilled,
          subjectType: "product",
          subjectId: product.id,
          payload: {
            subjectLabel: snapshot.name.fr,
            variant: namedVariant(snapshot, row.variantId),
            proPriceMillicents: price.millicents,
            ratioBp,
            vatPercent: row.vatPercent,
          },
        });
      }
      if (ticket !== null) {
        await this.products.save(product, ticket);
        await this.emitter.emitProducts([product.id]);
      }
    });
  }
}
