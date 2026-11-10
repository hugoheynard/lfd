import type { StaffStamp } from "../domain/entities/collection-batch.js";
import {
  CollectionReturn,
  type RecordReturnInput,
  type ReturnableLine,
} from "../domain/entities/collection-return.js";
import {
  CollectionReturnNotFoundError,
  ReturnableLineNotFoundError,
  ReturnOnRejectedBatchError,
} from "../domain/errors/collection-return-errors.js";
import { CollectionReturnedEvent } from "../domain/events/collection-return.events.js";
import type { CollectionBatchLock } from "../domain/ports/collection-batch-lock.js";
import type { CollectionReturnRepository } from "../domain/ports/collection-return.repository.js";
import type { OrderCollectionRepository } from "../domain/ports/order-collection.repository.js";
import type { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";

/** Le nom dit quand l'annuaire ne reconnaît plus la référence du rejet. */
const UNKNOWN_REJECTION_AUTHOR = "un membre de l'équipe";

/**
 * Ce que l'enregistrement d'un retour écrit — partagé par la saisie à la main
 * (R5a) et la confirmation d'un import (R5b) : un seul chemin, donc une seule
 * règle. Rien ici n'ouvre de transaction ; l'appelant la tient.
 */
export interface ReturnWriters {
  /** Le verrou du lot, pris avant de relire la ligne : la course avec un rejet du fichier. */
  readonly locks: CollectionBatchLock;
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
  // Sous le verrou du lot, l'état relu est le dernier écrit : un rejet du
  // fichier déclaré au même instant est vu, et refusé par l'agrégat.
  await writers.locks.lock(line.batchId);
  const current = (await writers.lines.lineOf(line.batchId, line.rank)) ?? line;
  const already = await writers.lines.alreadyReturned([current.endToEndId]);
  const bankReturn = CollectionReturn.record(
    { ...entry, ...identity },
    current,
    already.has(current.endToEndId),
  );
  const orders = await writers.orders.ofLine(line.batchId, line.rank);
  for (const order of orders) {
    order.bounce(identity.recorded.at);
  }
  await writers.returns.save(bankReturn);
  await writers.orders.saveAll(orders);
  await writers.events.publishTraced(
    new CollectionReturnedEvent(bankReturn, current, identity.recorded.at),
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

/**
 * Le refus d'un retour sur un lot rejeté par la banque **nomme qui a déclaré
 * le rejet** (décision de Hugo, 2026-10-23) : l'annuaire n'est lu qu'ici, au
 * refus, jamais sur le chemin d'un retour qui s'enregistre. Toute autre
 * erreur repart telle quelle.
 */
export async function nameRejectionAuthor(
  error: unknown,
  authors: StaffAuthorDirectory,
): Promise<unknown> {
  if (!(error instanceof ReturnOnRejectedBatchError) || error.rejection === null) {
    return error;
  }
  const byStaffId = error.rejection.byStaffId;
  const name = (await authors.identify([byStaffId])).nameOf(byStaffId);
  return error.declaredBy(name ?? UNKNOWN_REJECTION_AUTHOR);
}
