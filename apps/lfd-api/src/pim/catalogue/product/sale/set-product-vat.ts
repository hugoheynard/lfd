import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { requireRateInService } from "../../../reference/vat-rates/application/vat-support.js";
import { VatRateRepository } from "../../../reference/vat-rates/domain/ports/vat-rate.repository.js";
import { VatRateLock } from "../../../reference/vat-rates/domain/ports/vat-rate.lock.js";
import { SalesContextLock } from "../../../reference/sales-contexts/domain/ports/sales-context.lock.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { SalesContextRegistry } from "../../../reference/sales-contexts/domain/ports/sales-context.registry.js";
import type { ContextVat } from "../../shared/domain/value-objects/context-vat.js";
import { vatChangePayload } from "../../shared/domain/services/vat-change-payload.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "../shared/product-support.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";

export class SetProductVatCommand {
  constructor(
    readonly id: string,
    readonly vat: ContextVat,
  ) {}
}

/**
 * Fait **déroger** un produit au taux de sa famille — ou le lui rend.
 *
 * Une carte vide n'est pas une dérogation vide : c'est le retour à l'héritage.
 * Le geste est donc réversible sans écrire un état « pas de dérogation », qui
 * ressemblerait à une décision et se compterait comme un usage.
 *
 * Deux vérifications : le taux existe, le contexte existe (registre, que le
 * produit tient une fois qu'on le lui montre). Que la famille vende ce
 * contexte ou non ne compte plus : la TVA ne dépend plus des canaux
 * (2026-10-15).
 */
@CommandHandler(SetProductVatCommand)
export class SetProductVatHandler implements ICommandHandler<SetProductVatCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly rates: VatRateRepository,
    private readonly rateLock: VatRateLock,
    private readonly contextLock: SalesContextLock,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductVatCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    await this.uow.run(async () => {
      // Les taux et les contextes visés sont verrouillés en partage AVANT d'être
      // relus : une archive en cours finit d'abord, et la relecture voit alors
      // le taux archivé ou le contexte retiré — la pose refuse. Sans lui, une
      // archive pourrait compter zéro usage pendant que cette pose écrit.
      await this.rateLock.forUse(Object.values(command.vat));
      await this.contextLock.forUse(Object.keys(command.vat));
      // Tout est validé AVANT la première écriture : rien ne doit se retrouver
      // avec un taux posé et un autre refusé.
      for (const rateId of Object.values(command.vat)) {
        await requireRateInService(this.rates, rateId);
      }
      const before = product.vatByContext;
      product.setVat(command.vat, await this.contexts.active());
      const ticket = await this.journalize(product, before, product.vatByContext);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.id]);
    });
  }

  /**
   * Une dérogation de TVA est une décision qui se relit : c'est elle qu'on
   * cherche quand une facture surprend. Silencieux quand rien n'a bougé — un
   * formulaire réenregistré à l'identique n'est pas un fait.
   */
  private async journalize(
    product: Product,
    before: ContextVat,
    after: ContextVat,
  ): Promise<WriteTicket> {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const changed = keys.filter((key) => before[key] !== after[key]);
    if (changed.length === 0) {
      return this.journal.untraced("aucune dérogation de taux modifiée");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productVatChanged,
      subjectType: "product",
      subjectId: product.id,
      // Chaque taux et chaque contexte NOMMÉS (D5 du plan des phrases) : un
      // taux renommé depuis se relit sous le nom qu'il portait ce jour-là.
      payload: {
        subjectLabel: product.snapshot().name.fr,
        ...(await vatChangePayload(
          Object.fromEntries(
            changed.map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
          ),
          this.rates,
          this.contexts,
        )),
      },
    });
  }
}
