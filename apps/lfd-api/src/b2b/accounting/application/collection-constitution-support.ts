import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
  CollectionRowsLockMissingError,
} from "../domain/errors/collection-errors.js";
import type { CollectionCalendarReader } from "../domain/ports/collection-calendar.reader.js";
import type {
  CollectableOrder,
  CollectionCandidatesReader,
} from "../domain/ports/collection-candidates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { CountedLotInputsReader } from "../domain/ports/counted-lot-inputs.reader.js";
import type { OrderRowsLock } from "../domain/ports/order-rows-lock.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import {
  calendarCycleToConstitute,
  type ClosureSequence,
} from "../domain/services/calendar-cycles.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import {
  assembleCollection,
  type Assembly,
  type AssemblyInput,
} from "../domain/services/collection-assembly.js";
import {
  readInvoicingCalendar,
  type InvoicingCalendarReaders,
} from "./invoicing-calendar-support.js";

/**
 * La première moitié de la constitution d'un lot, sortie du handler pour
 * qu'il reste une orchestration lisible : LIRE le monde (`readAssembly`).
 * La seconde, FABRIQUER les agrégats, est dans `collection-batch-building.ts`.
 * Rien ici n'écrit.
 */

/** Ce que `readAssembly` lit — `CollectionAssemblyReaders` le fournit. */
export interface ConstitutionReaders {
  readonly candidates: CollectionCandidatesReader;
  /** Le plancher, la clôture précédente, la facture du mois, les schémas pris. */
  readonly cycle: CollectionCalendarReader;
  /** La forme des sites à la clôture, les mandats ponctuels consommés. */
  readonly sites: CountedLotInputsReader;
  readonly mandates: CollectionMandatesReader;
  /**
   * Le calendrier de la facture (M3) : le cycle du lot va de clôture en
   * clôture du calendrier — celles d'au moins un payeur.
   */
  readonly calendar: InvoicingCalendarReaders;
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
 * @param rows le verrou des lignes `orders` des candidats (C5.3) — la
 *        constitution le fournit, l'aperçu non (`null`) : il ne verrouille rien.
 * @throws {CollectionFloorMissingError} le plancher n'est pas posé.
 * @throws {CollectionNotYetOpenError} le cycle se clôt avant le plancher.
 */
export async function readAssembly(
  readers: ConstitutionReaders,
  rows: OrderRowsLock | null,
  legalEntityId: string,
  at: Date,
  mode: AssemblyMode = TO_CONSTITUTE,
): Promise<ReadAssembly> {
  const floor = await readers.cycle.floor();
  if (floor === null) {
    throw new CollectionFloorMissingError();
  }
  const { calendar, previousClosure, cycle } = await readCycle(
    readers,
    legalEntityId,
    at,
    mode.cycleOf,
  );
  // Rien ne peut être après le plancher ET avant la clôture : le dire tel
  // quel, plutôt que « aucune commande à prélever ». La première clôture
  // prélevable est la première du calendrier après le plancher.
  if (floor >= cycle.closesAt) {
    throw new CollectionNotYetOpenError(floor, calendar.closureAfter(floor));
  }
  const orders = await lockedCandidates(readers.candidates, rows, mode, floor, cycle.closesAt);
  const parties = await readParties(readers, orders, cycle.closesAt);
  const assembly = assembleCollection({
    legalEntityId,
    at,
    payerPeriodStartsAt: (payer) => calendar.payerPeriodStartAt(payer, cycle.closesAt),
    orders,
    ...parties,
    liveSchemes: await readers.cycle.liveSchemes(legalEntityId, cycle.closesAt),
    invoicingFloor: mode.simulateUninvoiced ? null : await readers.cycle.invoicingFloor(),
  });
  return { cycle, previousClosure, calendar, floor, assembly, companyNames: parties.companyNames };
}

/** Ce que les candidats appellent : factures, payeurs, sites, mandats et noms. */
type Parties = Pick<
  AssemblyInput,
  "invoices" | "follows" | "mandates" | "companyNames" | "collectionForms" | "consumedMandates"
>;

/**
 * Les payeurs et les sites des candidats, et ce qu'on lit d'eux. Les sites
 * réglés par un autre : leur propre mandat peut être l'effectif (formes 2
 * et 3, sous-comptes §2.1 ter), jugé à la CLÔTURE du cycle.
 */
async function readParties(
  readers: ConstitutionReaders,
  orders: readonly CollectableOrder[],
  closesAt: Date,
): Promise<Parties & { readonly companyNames: ReadonlyMap<string, string> }> {
  const { candidates, sites: siteReader } = readers;
  const invoices = await candidates.invoicesOf(orders.map((order) => order.orderId));
  const follows = await candidates.billingFollowsOf(unique(orders.map((order) => order.companyId)));
  const payers = unique(orders.map((order) => billedPayerOf(order, follows)));
  const sites = unique(
    orders
      .filter((order) => billedPayerOf(order, follows) !== order.companyId)
      .map((o) => o.companyId),
  );
  const mandates = await readers.mandates.activeFor(unique([...payers, ...sites]));
  const oneOffs = mandates.filter((mandate) => mandate.paymentType === "one_off");
  // Les sites aussi : en formes 2 et 3, c'est le site qu'on nomme sans mandat.
  const companyNames = await candidates.companyNames(unique([...payers, ...sites]));
  return {
    invoices,
    follows,
    mandates,
    companyNames,
    collectionForms: await siteReader.collectionFormsAt(sites, closesAt),
    consumedMandates: await siteReader.consumedMandates(oneOffs.map((m) => m.mandateId)),
  };
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
  candidates: CollectionCandidatesReader,
  rows: OrderRowsLock | null,
  mode: AssemblyMode,
  floor: Date,
  closesAt: Date,
): Promise<readonly CollectableOrder[]> {
  const ids = await candidates.collectableOrderIds(floor, closesAt);
  if (mode.lockRows) {
    if (rows === null) {
      throw new CollectionRowsLockMissingError();
    }
    await rows.lockAll(ids);
  }
  return candidates.collectableOrders(floor, closesAt, ids);
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
  const previousClosure = await readers.cycle.previousClosure(legalEntityId, target);
  return { calendar, previousClosure, cycle: cycleOf(at, calendar, previousClosure) };
}

function unique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
