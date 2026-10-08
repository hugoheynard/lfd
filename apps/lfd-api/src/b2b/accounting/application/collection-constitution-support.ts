import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { CollectionBatch } from "../domain/entities/collection-batch.js";
import { OrderCollection } from "../domain/entities/order-collection.js";
import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
} from "../domain/errors/collection-errors.js";
import type {
  CollectableOrder,
  CollectionCandidatesReader,
} from "../domain/ports/collection-candidates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import { cycleAt, cycleToConstitute, type BillingCycle } from "../domain/services/billing-cycle.js";
import { assembleCollection, type Assembly } from "../domain/services/collection-assembly.js";
import { renderBatchFile } from "../domain/services/collection-batch-file.js";
import { frozenCollectionDay } from "../domain/services/collection-calendar.js";

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
  /** La mise en service du prélèvement : aucune commande antérieure n'entre. */
  readonly floor: Date;
  readonly assembly: Assembly;
  /** Les raisons sociales des payeurs et des sites lus — l'aperçu les nomme. */
  readonly companyNames: ReadonlyMap<string, string>;
}

/**
 * Quel cycle on assemble : celui qu'on CONSTITUE (le dernier clos, par
 * défaut) ou celui qui COURT (l'aperçu du mois, PA4). Même signature que
 * `cycleToConstitute` et `cycleAt`, qui sont les deux valeurs admises.
 */
export type CycleChoice = (at: Date, previousClosure: Date | null) => BillingCycle;

/**
 * @throws {CollectionFloorMissingError} le plancher n'est pas posé.
 * @throws {CollectionNotYetOpenError} le cycle se clôt avant le plancher.
 */
export async function readAssembly(
  readers: ConstitutionReaders,
  legalEntityId: string,
  at: Date,
  cycleOf: CycleChoice = cycleToConstitute,
): Promise<ReadAssembly> {
  const { candidates } = readers;
  const floor = await candidates.floor();
  if (floor === null) {
    throw new CollectionFloorMissingError();
  }
  const target = cycleOf(at, null).closesAt;
  const previousClosure = await candidates.previousClosure(legalEntityId, target);
  const cycle = cycleOf(at, previousClosure);
  // Rien ne peut être après le plancher ET avant la clôture : le dire tel
  // quel, plutôt que « aucune commande à prélever ».
  if (floor >= cycle.closesAt) {
    throw new CollectionNotYetOpenError(floor, cycleAt(floor, null).closesAt);
  }
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
  const companyNames = await candidates.companyNames(unique([...payers, ...sites]));
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
    companyNames,
    liveSchemes: await candidates.liveSchemes(legalEntityId, cycle.closesAt),
  });
  return { cycle, previousClosure, floor, assembly, companyNames };
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
      constituted: { at: input.at, staffId: input.staffId },
      unmandatedCompanies: read.assembly.unmandatedCompanies,
      lines: file.lines,
      xml: file.xml,
      fileSha256: file.sha256,
      requestedCollectionDay,
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

function unique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
