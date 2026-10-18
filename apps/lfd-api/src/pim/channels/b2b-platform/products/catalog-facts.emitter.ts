import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogEmitter } from "../../../catalogue/shared/domain/ports/catalog-emitter.js";
import { CatalogCategoryChangedFact } from "./catalog-category-changed.fact.js";
import { CatalogSnapshots } from "./catalog-snapshots.js";
import { CatalogProductChangedFact } from "./catalog-product-changed.fact.js";
import { PublicationSequence } from "./publication-sequence.js";

/**
 * **L'émetteur unique des faits du catalogue** (2a2 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, C4).
 *
 * Dans la transaction du geste, en dernière instruction : verrouille les
 * lignes (triées), relit et projette, tire un numéro par fait, écrit dans la
 * boîte d'envoi. Le relais ne livre qu'après la validation ; un rollback
 * emporte le fait avec le geste.
 *
 * Toujours ouvert depuis le 2026-10-17 (X1 de
 * `documentation/catalogue/catalogue-synchronise.md` §6) : les interrupteurs
 * `CATALOG_FACTS_ENABLED` et `PIM_PUBLICATION_ENABLED` sont retirés.
 */
@Injectable()
export class B2bCatalogFactsEmitter extends CatalogEmitter {
  constructor(
    private readonly sequence: PublicationSequence,
    private readonly source: CatalogSnapshots,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
  ) {
    super();
  }

  async emitProducts(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) {
      return;
    }
    const locked = await this.sequence.lockProducts(sortedUnique(productIds));
    const bodies = await this.source.products(locked);
    const emittedAt = this.clock.now().toISOString();
    for (const id of locked) {
      const body = bodies.get(id);
      if (body !== undefined) {
        const seq = await this.sequence.next();
        await this.durable.publish(
          new CatalogProductChangedFact(id, seq, emittedAt, body).durableFact(),
        );
      }
    }
  }

  async emitCategories(categoryIds: readonly string[]): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }
    const locked = await this.sequence.lockCategories(sortedUnique(categoryIds));
    const bodies = await this.source.families(locked);
    const emittedAt = this.clock.now().toISOString();
    for (const id of locked) {
      const family = bodies.get(id);
      if (family !== undefined) {
        const seq = await this.sequence.next();
        await this.durable.publish(
          new CatalogCategoryChangedFact(id, seq, emittedAt, family).durableFact(),
        );
      }
    }
  }
}

/** Triés et sans doublon : le seul ordre de verrou du mécanisme. */
function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}
