import { Injectable } from "@nestjs/common";
import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogRulesEmitter } from "../../../order-time-limitation/domain/ports/catalog-rules.emitter.js";
import { OrderTimeLimitRepository } from "../../../order-time-limitation/domain/ports/order-time-limit.repository.js";
import { CatalogRulesChangedFact } from "./catalog-rules-changed.fact.js";
import { toSyncRule } from "./order-time-limits.js";
import { PublicationSequence } from "./publication-sequence.js";

/** Les portées que le référentiel pose, donc les seules qu'il émet. */
function isEmitted(rule: OrderTimeLimitView): boolean {
  return rule.scope.type === "product" || rule.scope.type === "category";
}

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
    // commerce ne la reçoit plus. Le produit et la famille seulement (décisions
    // de Hugo du 2026-10-21 et du 2026-11-23) : un rang global ou une
    // déclinaison résiduels ne traversent pas — un fait qui les porte ferait
    // croire qu'ils comptent. Une famille part avec ses exclusions.
    const rules = (await this.limits.inForce()).filter(isEmitted).map(toSyncRule);
    await this.durable.publish(
      new CatalogRulesChangedFact(seq, this.clock.now().toISOString(), rules).durableFact(),
    );
  }
}
