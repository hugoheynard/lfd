import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { CollectionBatch, type ConstitutionAuthor } from "../domain/entities/collection-batch.js";
import { OrderCollection } from "../domain/entities/order-collection.js";
import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
  CollectionRowsLockMissingError,
} from "../domain/errors/collection-errors.js";
import type {
  CollectableOrder,
  CollectionCandidatesReader,
} from "../domain/ports/collection-candidates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { OrderRowsLock } from "../domain/ports/order-rows-lock.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import {
  calendarCycleToConstitute,
  type ClosureSequence,
} from "../domain/services/calendar-cycles.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { assembleCollection, type Assembly } from "../domain/services/collection-assembly.js";
import { renderBatchFile } from "../domain/services/collection-batch-file.js";
import { frozenCollectionDay } from "../domain/services/collection-calendar.js";
import {
  readInvoicingCalendar,
  type InvoicingCalendarReaders,
} from "./invoicing-calendar-support.js";

/**
 * Les deux moitiés de la constitution d'un lot, sorties du handler pour qu'il
 * reste une orchestration lisible : LIRE le monde (`readAssembly`), puis
 * FABRIQUER les agrégats (`buildBatches`, `orderStates`). Rien ici n'écrit.
 */

export interface ConstitutionReaders {
  readonly candidates: CollectionCandidatesReader;
  readonly mandates: CollectionMandatesReader;
  /**
   * Le calendrier de la facture (M3) : le cycle du lot va de clôture en
   * clôture du calendrier — celles d'au moins un payeur.
   */
  readonly calendar: InvoicingCalendarReaders;
  /**
   * Le verrou des lignes `orders` des candidats (C5.3) — la constitution le
   * fournit, l'aperçu non (`null`) : il ne verrouille rien.
   */
  readonly rows: OrderRowsLock | null;
}

export interface ReadAssembly {
  readonly cycle: BillingCycle;
  readonly previousClosure: Date | null;
  /** Le calendrier de la facture, que le lot relit pour juger sa première clôture. */
  readonly calendar: InvoicingCalendar;
  /** La mise en service du prélèvement : aucune commande antérieure n'entre. */
  readonly floor: Date;
  readonly assembly: Assembly;
  /** Les raisons sociales des payeurs et des sites lus — l'aperçu les nomme. */
  readonly companyNames: ReadonlyMap<string, string>;
}

/**
 * Quel cycle on assemble : celui qu'on CONSTITUE (le dernier clos, par
 * défaut) ou celui qui COURT (l'aperçu, PA4), sur le calendrier de la
 * facture (M3). Même signature que `calendarCycleToConstitute` et
 * `calendarCycleAt`, qui sont les deux valeurs admises.
 */
export type CycleChoice = (
  at: Date,
  calendar: ClosureSequence,
  previousClosure: Date | null,
) => BillingCycle;

/** Comment on assemble : pour constituer (par défaut), ou pour l'aperçu. */
export interface AssemblyMode {
  readonly cycleOf: CycleChoice;
  /**
   * L'aperçu SIMULE la facture des bons qui n'en ont pas encore (le mois
   * court, la facture du mois ne passe qu'à sa fin) ; la constitution les
   * laisse attendre la leur (E4).
   */
  readonly simulateUninvoiced: boolean;
  /**
   * Verrouiller les lignes `orders` des candidats avant de les relire (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3). La constitution le fait :
   * une annulation ou un « réglée autrement » validé pendant qu'elle lisait
   * ne doit pas être écrasé. L'aperçu non : il dit l'état du moment.
   */
  readonly lockRows: boolean;
}

const TO_CONSTITUTE: AssemblyMode = {
  cycleOf: calendarCycleToConstitute,
  simulateUninvoiced: false,
  lockRows: true,
};

/**
 * N'atteste pas que l'entité existe : chaque appelant le vérifie par le port
 * qu'il lit déjà (créancier, entité).
 *
 * @throws {CollectionFloorMissingError} le plancher n'est pas posé.
 * @throws {CollectionNotYetOpenError} le cycle se clôt avant le plancher.
 */
export async function readAssembly(
  readers: ConstitutionReaders,
  legalEntityId: string,
  at: Date,
  mode: AssemblyMode = TO_CONSTITUTE,
): Promise<ReadAssembly> {
  const { candidates } = readers;
  const { cycleOf } = mode;
  const floor = await candidates.floor();
  if (floor === null) {
    throw new CollectionFloorMissingError();
  }
  const { calendar, previousClosure, cycle } = await readCycle(readers, legalEntityId, at, cycleOf);
  // Rien ne peut être après le plancher ET avant la clôture : le dire tel
  // quel, plutôt que « aucune commande à prélever ». La première clôture
  // prélevable est la première du calendrier après le plancher.
  if (floor >= cycle.closesAt) {
    throw new CollectionNotYetOpenError(floor, calendar.closureAfter(floor));
  }
  const orders = await lockedCandidates(readers, mode, floor, cycle.closesAt);
  const invoices = await candidates.invoicesOf(orders.map((order) => order.orderId));
  const follows = await candidates.billingFollowsOf(unique(orders.map((order) => order.companyId)));
  const payers = unique(orders.map((order) => billedPayerOf(order, follows)));
  // Les sites réglés par un autre : leur propre mandat peut être l'effectif
  // (formes 2 et 3, sous-comptes §2.1 ter), jugé à la CLÔTURE du cycle.
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
    payerPeriodStartsAt: (payer) => calendar.payerPeriodStartAt(payer, cycle.closesAt),
    orders,
    follows,
    mandates,
    collectionForms: await candidates.collectionFormsAt(sites, cycle.closesAt),
    consumedMandates: await candidates.consumedMandates(oneOffs.map((m) => m.mandateId)),
    // Les sites aussi : en formes 2 et 3, c'est le site qu'on nomme sans mandat.
    companyNames,
    liveSchemes: await candidates.liveSchemes(legalEntityId, cycle.closesAt),
    invoices,
    invoicingFloor: mode.simulateUninvoiced ? null : await candidates.invoicingFloor(),
  });
  return { cycle, previousClosure, calendar, floor, assembly, companyNames };
}

/**
 * Les candidats, lus en DEUX temps (C5.3, BLOQUANT du 2ᵉ passage de
 * `vitruve`) : leurs seuls identifiants, puis — en mode constitution — le
 * verrou de leurs lignes `orders` dans l'ordre unique (`OrderRowsLock`), puis
 * la RELECTURE des commandes et de leur `order_collection`. Rien de ce qui est
 * lu avant le verrou ne sert à constituer : une annulée validée entre-temps
 * sort de l'assiette, une réglée autrement n'est plus ouverte.
 *
 * Ferme aussi la course préexistante « réglée autrement × constitution »
 * (C5.1, 13), où l'état lu avant tout verrou était réécrit par `saveAll`.
 */
async function lockedCandidates(
  readers: ConstitutionReaders,
  mode: AssemblyMode,
  floor: Date,
  closesAt: Date,
): Promise<readonly CollectableOrder[]> {
  const ids = await readers.candidates.collectableOrderIds(floor, closesAt);
  if (mode.lockRows) {
    if (readers.rows === null) {
      throw new CollectionRowsLockMissingError();
    }
    await readers.rows.lockAll(ids);
  }
  return readers.candidates.collectableOrders(floor, closesAt, ids);
}

/** Le calendrier de la facture, la dernière clôture enregistrée, et le cycle choisi. */
async function readCycle(
  readers: ConstitutionReaders,
  legalEntityId: string,
  at: Date,
  cycleOf: CycleChoice,
): Promise<{
  readonly calendar: InvoicingCalendar;
  readonly previousClosure: Date | null;
  readonly cycle: BillingCycle;
}> {
  const calendar = await readInvoicingCalendar(readers.calendar, legalEntityId);
  const target = cycleOf(at, calendar, null).closesAt;
  const previousClosure = await readers.candidates.previousClosure(legalEntityId, target);
  return { calendar, previousClosure, cycle: cycleOf(at, calendar, previousClosure) };
}

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
