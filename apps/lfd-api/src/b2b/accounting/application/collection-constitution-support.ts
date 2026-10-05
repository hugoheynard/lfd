import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { CollectionBatch } from "../domain/entities/collection-batch.js";
import { OrderCollection } from "../domain/entities/order-collection.js";
import { CollectionFloorMissingError } from "../domain/errors/collection-errors.js";
import type {
  CollectableOrder,
  CollectionCandidatesReader,
} from "../domain/ports/collection-candidates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import { cycleToConstitute, type BillingCycle } from "../domain/services/billing-cycle.js";
import { assembleCollection, type Assembly } from "../domain/services/collection-assembly.js";
import { renderBatchFile } from "../domain/services/collection-batch-file.js";

/**
 * Les deux moitiés de la constitution d'un lot, sorties du handler pour qu'il
 * reste une orchestration lisible : LIRE le monde (`readAssembly`), puis
 * FABRIQUER les agrégats (`buildBatches`, `orderStates`). Rien ici n'écrit.
 */

export interface ConstitutionReaders {
  readonly candidates: CollectionCandidatesReader;
  readonly mandates: CollectionMandatesReader;
}

export interface ReadAssembly {
  readonly cycle: BillingCycle;
  readonly previousClosure: Date | null;
  readonly assembly: Assembly;
}

/** @throws {CollectionFloorMissingError} le plancher n'est pas posé. */
export async function readAssembly(
  readers: ConstitutionReaders,
  legalEntityId: string,
  at: Date,
): Promise<ReadAssembly> {
  const { candidates } = readers;
  const floor = await candidates.floor();
  if (floor === null) {
    throw new CollectionFloorMissingError();
  }
  const target = cycleToConstitute(at, null).closesAt;
  const previousClosure = await candidates.previousClosure(legalEntityId, target);
  const cycle = cycleToConstitute(at, previousClosure);
  const orders = await candidates.collectableOrders(floor, cycle.closesAt);
  const follows = await candidates.billingFollowsOf(unique(orders.map((order) => order.companyId)));
  const payers = unique(orders.map((order) => billedPayerOf(order, follows)));
  // Les sites réglés par un autre : leur propre mandat peut être l'effectif
  // (formes 2 et 3, plan-sous-comptes §2.1 ter), jugé à la CLÔTURE du cycle.
  const sites = unique(
    orders
      .filter((order) => billedPayerOf(order, follows) !== order.companyId)
      .map((o) => o.companyId),
  );
  const mandates = await readers.mandates.activeFor(unique([...payers, ...sites]));
  const oneOffs = mandates.filter((mandate) => mandate.paymentType === "one_off");
  const assembly = assembleCollection({
    legalEntityId,
    at,
    cycleStartsAt: cycle.startsAt,
    orders,
    follows,
    mandates,
    collectionForms: await candidates.collectionFormsAt(sites, cycle.closesAt),
    consumedMandates: await candidates.consumedMandates(oneOffs.map((m) => m.mandateId)),
    // Les sites aussi : en formes 2 et 3, c'est le site qu'on nomme sans mandat.
    companyNames: await candidates.companyNames(unique([...payers, ...sites])),
    liveSchemes: await candidates.liveSchemes(legalEntityId, cycle.closesAt),
  });
  return { cycle, previousClosure, assembly };
}

export interface BuildInput {
  readonly read: ReadAssembly;
  readonly legalEntityId: string;
  readonly creditor: CreditorSnapshot;
  readonly at: Date;
  readonly staffId: string;
  readonly nextId: () => string;
}

/** Un lot par schéma qui a des lignes, son fichier rendu et figé. */
export function buildBatches(input: BuildInput): readonly CollectionBatch[] {
  const { read } = input;
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
    });
    return CollectionBatch.constitute({
      id,
      legalEntityId: input.legalEntityId,
      scheme,
      cycle: read.cycle,
      previousClosure: read.previousClosure,
      constituted: { at: input.at, staffId: input.staffId },
      unmandatedCompanies: read.assembly.unmandatedCompanies,
      lines: file.lines,
      xml: file.xml,
      fileSha256: file.sha256,
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

function unique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
