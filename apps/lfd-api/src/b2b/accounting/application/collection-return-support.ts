import type { StaffStamp } from "../domain/entities/collection-batch.js";
import {
  CollectionReturn,
  type RecordReturnInput,
  type ReturnableLine,
} from "../domain/entities/collection-return.js";
import {
  CollectionReturnNotFoundError,
  ReturnableLineNotFoundError,
} from "../domain/errors/collection-return-errors.js";
import { CollectionReturnedEvent } from "../domain/events/collection-return.events.js";
import type { CollectionReturnRepository } from "../domain/ports/collection-return.repository.js";
import type { OrderCollectionRepository } from "../domain/ports/order-collection.repository.js";
import type { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";

/**
 * Ce que l'enregistrement d'un retour écrit — partagé par la saisie à la main
 * (R5a) et la confirmation d'un import (R5b) : un seul chemin, donc une seule
 * règle. Rien ici n'ouvre de transaction ; l'appelant la tient.
 */
export interface ReturnWriters {
  readonly returns: CollectionReturnRepository;
  readonly lines: ReturnableLinesReader;
  readonly orders: OrderCollectionRepository;
  readonly events: DomainEventPublisher;
}

/** Ce que la saisie fournit ; l'id, l'auteur et l'instant viennent du handler. */
export type ReturnEntry = Omit<RecordReturnInput, "id" | "recorded">;

/**
 * Enregistre le retour d'une ligne : l'agrégat refuse ce qui ne se retourne
 * pas, puis TOUTES les commandes de la ligne passent `returned` — un retour
 * porte sur la ligne entière, jamais sur une partie (§ 2).
 */
export async function recordReturn(
  writers: ReturnWriters,
  line: ReturnableLine,
  entry: ReturnEntry,
  identity: { readonly id: string; readonly recorded: StaffStamp },
): Promise<CollectionReturn> {
  const already = await writers.lines.alreadyReturned([line.endToEndId]);
  const bankReturn = CollectionReturn.record(
    { ...entry, ...identity },
    line,
    already.has(line.endToEndId),
  );
  const orders = await writers.orders.ofLine(line.batchId, line.rank);
  for (const order of orders) {
    order.bounce(identity.recorded.at);
  }
  await writers.returns.save(bankReturn);
  await writers.orders.saveAll(orders);
  await writers.events.publishTraced(
    new CollectionReturnedEvent(bankReturn, line, identity.recorded.at),
  );
  return bankReturn;
}

/** Un retour et sa ligne, ou le 404 qui nomme ce qui manque. */
export async function loadReturnWithLine(
  returns: CollectionReturnRepository,
  lines: ReturnableLinesReader,
  returnId: string,
): Promise<{ readonly bankReturn: CollectionReturn; readonly line: ReturnableLine }> {
  const bankReturn = await returns.load(returnId);
  if (bankReturn === null) {
    throw new CollectionReturnNotFoundError(returnId);
  }
  const line = (await lines.byEndToEndIds([bankReturn.endToEndId])).get(bankReturn.endToEndId);
  // Inatteignable : la clé étrangère `collection_return_end_to_end_id_fkey` tient la ligne.
  if (line === undefined) {
    throw new ReturnableLineNotFoundError(bankReturn.endToEndId);
  }
  return { bankReturn, line };
}
