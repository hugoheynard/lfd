import { Injectable } from "@nestjs/common";

import { currentRequestContext } from "../context/request-context.store.js";
import { PrismaService } from "../database/prisma.service.js";
import { currentTransaction } from "../database/transaction.store.js";
import { IdGenerator } from "../id/id-generator.js";
import { Clock } from "../time/clock.js";
import type { DurableFact } from "./durable-event.js";
import { DurableSubscribers } from "./durable-handler.js";
import { Outbox } from "./outbox.js";
import { DurableFactOutsideUnitOfWorkError } from "./outbox-errors.js";

/** Préfixe des identifiants de message — lisible dans un journal. */
const MESSAGE_ID_PREFIX = "outbox_";

/**
 * L'écriture d'un fait durable : le message ET une livraison par abonné
 * inscrit, en UNE instruction, dans la transaction ambiante.
 *
 * `ON CONFLICT (key) DO NOTHING` : un fait déjà écrit ne se réécrit pas, et
 * ses livraisons non plus — la CTE ne rend aucune ligne.
 */
@Injectable()
export class PrismaOutbox extends Outbox {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscribers: DurableSubscribers,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async append(fact: DurableFact): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new DurableFactOutsideUnitOfWorkError(fact.type);
    }
    const id = `${MESSAGE_ID_PREFIX}${this.ids.next()}`;
    const now = this.clock.now();
    const traceId = currentRequestContext()?.traceId ?? null;
    const names = this.subscribers.subscribersOf(fact.type).map((subscriber) => subscriber.name);
    await this.prisma.$executeRaw`
      WITH inserted AS (
        INSERT INTO platform.outbox (id, key, type, payload, occurred_at, trace_id)
        VALUES (${id}, ${fact.key}, ${fact.type}, ${JSON.stringify(fact.payload)}::jsonb,
                ${now}::timestamptz, ${traceId})
        ON CONFLICT (key) DO NOTHING
        RETURNING id
      )
      INSERT INTO platform.outbox_delivery (event_id, subscriber, next_attempt_at)
      SELECT inserted.id, subscriber.name, ${now}::timestamptz
      FROM inserted CROSS JOIN unnest(${names}::text[]) AS subscriber(name)
    `;
  }
}
