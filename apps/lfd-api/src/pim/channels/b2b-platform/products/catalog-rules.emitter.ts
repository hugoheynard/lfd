import { Injectable } from "@nestjs/common";

import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogRulesEmitter } from "../../../order-time-limitation/domain/ports/catalog-rules.emitter.js";
import { OrderTimeLimitRepository } from "../../../order-time-limitation/domain/ports/order-time-limit.repository.js";
import { CatalogRulesChangedFact } from "./catalog-rules-changed.fact.js";
import { toSyncRule } from "./order-time-limits.js";
import { PublicationSequence } from "./publication-sequence.js";

/**
 * **L'émetteur des règles globales du catalogue** (lot 2b, C3) : dans la
 * transaction du geste, verrouille les règles, tire un numéro, RELIT l'échelle
 * entière en base et l'écrit dans la boîte d'envoi.
 *
 * Le verrou PUIS le numéro, comme pour une fiche (C4) : deux réglages
 * simultanés émettent deux échelles, et celle qui porte le plus grand numéro
 * contient forcément l'écriture de l'autre.
 */
@Injectable()
export class B2bCatalogRulesEmitter extends CatalogRulesEmitter {
  constructor(
    private readonly sequence: PublicationSequence,
    private readonly limits: OrderTimeLimitRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
  ) {
    super();
  }

  async emitRules(): Promise<void> {
    await this.sequence.lockRules();
    const seq = await this.sequence.next();
    // En vigueur seulement : une limite archivée cesse de s'appliquer, et le
    // commerce ne la reçoit plus. Le produit seulement (décision de Hugo,
    // 2026-10-21) : un rang global, une famille ou une déclinaison résiduels
    // ne traversent plus — un fait qui les porte ferait croire qu'ils comptent.
    const rules = (await this.limits.inForce())
      .filter((rule) => rule.scope.type === "product")
      .map(toSyncRule);
    await this.durable.publish(
      new CatalogRulesChangedFact(seq, this.clock.now().toISOString(), rules).durableFact(),
    );
  }
}
