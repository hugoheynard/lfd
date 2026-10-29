import { Injectable } from "@nestjs/common";

import { SaleReferenceIntake } from "../../../catalog/application/sale-reference-intake.service.js";
import { SaleSkuAliasReader } from "../../../catalog/domain/ports/sale-sku-alias.reader.js";
import { canonicalPreviousLines } from "../../domain/services/canonical-previous-lines.js";
import type { OrderLineSnapshot } from "../../domain/value-objects/order-line.js";
import type { OrderContent } from "./order-content.js";

/** La demande et la révision précédente, chacune sous les références canoniques. */
export interface NormalizedRevision {
  readonly content: OrderContent;
  readonly previous: readonly OrderLineSnapshot[];
}

/**
 * **La normalisation d'une commande ouverte à sa modification**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 6, D-d, L3).
 *
 * Une commande passée sous une ancienne référence (`PAI-001`) la garde tant
 * qu'on n'y touche pas. À la modification, la demande passe par la porte
 * d'entrée (`SaleReferenceIntake`, comptée sous `order_revision`) et la
 * révision précédente se lit sous la même cible
 * ({@link canonicalPreviousLines}) : la ligne garde son prix figé, deux
 * graphies d'un même article fusionnent (la commande ne porte qu'une ligne
 * par SKU), et le changement de référence est tracé avec la révision.
 */
@Injectable()
export class RevisionAliasNormalizing {
  constructor(
    private readonly intake: SaleReferenceIntake,
    private readonly aliases: SaleSkuAliasReader,
  ) {}

  async normalize(
    previous: readonly OrderLineSnapshot[],
    content: OrderContent,
  ): Promise<NormalizedRevision> {
    const [lines, table] = await Promise.all([
      this.intake.normalized(content.lines, "order_revision"),
      this.aliases.around(previous.map((line) => line.sku)),
    ]);
    return {
      content: lines === content.lines ? content : { ...content, lines },
      previous: canonicalPreviousLines(previous, (sku) => table.canonical(sku)),
    };
  }
}
