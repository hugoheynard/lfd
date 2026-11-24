import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { namedVariant, requireProduct, variantSnapshotOf } from "../shared/product-support.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";

export class SetVariantAudienceCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    /** `null` = la déclinaison suit sa fiche. */
    readonly audience: Audience | null,
  ) {}
}

/**
 * **Pose à qui une déclinaison vend** — ou la rend à sa fiche
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A1–A4, A8).
 *
 * Toute audience, plus large ou plus étroite que la fiche. Les refus — le
 * défaut suit toujours sa fiche, une fiche sans vignettes ne montrerait pas
 * la déclinaison — sont ceux de l'agrégat, avant toute écriture. L'émission
 * part dans la même unité de travail : le commerce pose l'audience sur
 * l'article de ce SKU au fait suivant.
 *
 * Journalisé comme les opérations : un fait quand quelque chose a changé, un
 * motif `untraced` sinon.
 */
@CommandHandler(SetVariantAudienceCommand)
export class SetVariantAudienceHandler implements ICommandHandler<SetVariantAudienceCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetVariantAudienceCommand): Promise<void> {
    const { productId, variantId, audience } = command;
    const product = await requireProduct(this.products, productId);
    const before = variantSnapshotOf(product.snapshot(), variantId).audience ?? null;
    const changed = product.changeVariantAudience(variantId, audience);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, variantId, before, changed);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  private async journalize(
    product: Product,
    variantId: string,
    before: Audience | null,
    changed: boolean,
  ): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("audience de la déclinaison inchangée");
    }
    const snapshot = product.snapshot();
    return this.journal.trace({
      type: PIM_EVENTS.variantAudienceChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: namedVariant(snapshot, variantId),
        audience: { from: before, to: variantSnapshotOf(snapshot, variantId).audience ?? null },
      },
    });
  }
}
