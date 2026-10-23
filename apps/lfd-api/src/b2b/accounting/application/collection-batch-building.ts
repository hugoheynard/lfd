import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { CollectionBatch, type ConstitutionAuthor } from "../domain/entities/collection-batch.js";
import { OrderCollection } from "../domain/entities/order-collection.js";
import type { CollectableOrder } from "../domain/ports/collection-candidates.reader.js";
import { renderBatchFile } from "../domain/services/collection-batch-file.js";
import { frozenCollectionDay } from "../domain/services/collection-calendar.js";
import { CollectionDay } from "../domain/value-objects/collection-day.js";
import type { ReadAssembly } from "./collection-constitution-support.js";

/**
 * La seconde moitié de la constitution d'un lot : FABRIQUER les agrégats
 * (`buildBatches`, `orderStates`) à partir de ce que `readAssembly` a lu.
 * Rien ici ne lit ni n'écrit.
 */

export interface BuildInput {
  readonly read: ReadAssembly;
  readonly legalEntityId: string;
  readonly creditor: CreditorSnapshot;
  readonly at: Date;
  readonly author: ConstitutionAuthor;
  readonly nextId: () => string;
}

/** Un lot par schéma qui a des lignes, son fichier rendu et figé. */
export function buildBatches(input: BuildInput): readonly CollectionBatch[] {
  const { read } = input;
  // UNE échéance pour tous les lots du cycle, tirée du calendrier et jamais
  // plus tôt que le préavis compté depuis aujourd'hui (D4) : le XML la porte,
  // le lot la fige, l'avis l'annonce — les trois ne peuvent pas diverger.
  const { day: requestedCollectionDay, postponedFrom } = frozenCollectionDay(
    read.cycle.closesAt,
    input.at,
    input.creditor.preNotificationDays,
    input.creditor.collectionDaysAfterClosure,
  );
  return [...read.assembly.debits.entries()].map(([scheme, debits]) => {
    const id = input.nextId();
    const file = renderBatchFile({
      batchId: id,
      creditor: input.creditor,
      scheme,
      cycle: read.cycle,
      constitutedAt: input.at,
      debits,
      unmandatedCompanies: read.assembly.unmandatedCompanies,
      requestedCollectionDay,
    });
    return CollectionBatch.constitute({
      id,
      legalEntityId: input.legalEntityId,
      scheme,
      cycle: read.cycle,
      previousClosure: read.previousClosure,
      calendar: read.calendar,
      constituted: { at: input.at, by: input.author },
      unmandatedCompanies: read.assembly.unmandatedCompanies,
      lines: file.lines,
      xml: file.xml,
      fileSha256: file.sha256,
      requestedCollectionDay: CollectionDay.of(requestedCollectionDay),
      postponedFromDay: postponedFrom,
    });
  });
}

/** Les états d'encaissement que la constitution pose : entrées en ligne, écartées. */
export function orderStates(
  read: ReadAssembly,
  batches: readonly CollectionBatch[],
  at: Date,
): readonly OrderCollection[] {
  const ordersOf = new Map(
    [...read.assembly.debits.values()]
      .flat()
      .flatMap((debit) => debit.orders.map((order) => [order.orderId, order] as const)),
  );
  const batched = batches.flatMap((batch) =>
    batch.lines.flatMap((line) =>
      line.orderIds.flatMap((orderId) => {
        const order = ordersOf.get(orderId);
        if (order === undefined) {
          return [];
        }
        const collection = collectionOf(order, at);
        collection.batch(batch.id, line.rank, at);
        return [collection];
      }),
    ),
  );
  const excluded = read.assembly.exclusions.map(({ order, reason }) => {
    const collection = collectionOf(order, at);
    collection.exclude(reason, at);
    return collection;
  });
  return [...batched, ...excluded];
}

function collectionOf(order: CollectableOrder, at: Date): OrderCollection {
  return order.collection === null
    ? OrderCollection.due(order.orderId, order.totalCents, at)
    : OrderCollection.rehydrate(order.collection);
}
