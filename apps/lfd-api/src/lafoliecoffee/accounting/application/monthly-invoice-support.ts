import type { StatementBuyer } from "../domain/entities/billing-statement.js";
import type { CollectionMandate } from "../domain/ports/collection-mandates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { MonthlyInvoicingReader } from "../domain/ports/monthly-invoicing.reader.js";
import type { PayersCollectionMeansReader } from "../domain/ports/payers-collection-means.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import type { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";
import type { PayerOrders } from "../domain/services/monthly-invoicing.js";
import { PayersCollectionMeans } from "../domain/services/payers-collection-means.js";
import type { CollectionMeans } from "../domain/value-objects/collection-means.js";
import type { CollectionFormName } from "../domain/value-objects/collection-form.js";
import { unique } from "./unique-ids.js";

/**
 * Ce que la facture du mois lit UNE fois pour tous ses payeurs — jamais une
 * lecture par payeur, ni par bon (lot E4). Rien n'est écrit ici.
 */
export interface MonthlyContextReaders {
  readonly reader: MonthlyInvoicingReader;
  readonly buyers: StatementBuyerReader;
  readonly mandates: CollectionMandatesReader;
  /** Le moyen d'encaissement des payeurs, en une lecture (K10). */
  readonly means: PayersCollectionMeansReader;
}

/** La période que l'émission ferme pour un payeur : où lire son moyen. */
export interface MonthlyPeriods {
  readonly legalEntityId: string;
  /** Le début de la période du payeur close à cette clôture. */
  readonly periodStartOf: (payerId: string) => Date;
}

export interface MonthlyContext {
  readonly follows: readonly BillingFollow[];
  readonly buyers: ReadonlyMap<string, StatementBuyer>;
  readonly names: ReadonlyMap<string, string>;
  readonly mandates: readonly CollectionMandate[];
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  /**
   * La date de livraison de chaque bon : `orders.received_on`, celle qui l'a
   * fait entrer dans l'assiette (lot ZL) — plus recalculée depuis les faits
   * du retrait et de la tournée à l'émission, pour que « livré le … » et le
   * mois de la facture ne puissent pas diverger.
   */
  readonly receivedOn: ReadonlyMap<string, string | null>;
  /**
   * Le moyen de la période de chaque payeur — celui en vigueur à son DÉBUT
   * (V3', K10) : la facture le fige, le lot le relira sur elle.
   */
  readonly collectionMeansOf: (payerId: string) => CollectionMeans;
}

/**
 * Lu AVANT le découpage par mandat (E4b) : c'est ce contexte qui le décide.
 *
 * @param at l'instant de l'émission : la forme de prélèvement d'un site y
 *        est lue, comme le lot la lit à sa clôture.
 */
export async function readMonthlyContext(
  readers: MonthlyContextReaders,
  payerOrders: readonly PayerOrders[],
  follows: readonly BillingFollow[],
  at: Date,
  periods: MonthlyPeriods,
): Promise<MonthlyContext> {
  const payers = payerOrders.map((payer) => payer.payerId);
  // Tous les bons, non facturables compris : leur mandat range aussi les
  // bons signalés dans la facture de leur mandat (E4b).
  const orders = payerOrders.flatMap((payer) => payer.orders);
  const sites = unique(orders.map((order) => order.companyId));
  const companies = unique([...payers, ...sites]);
  const [buyers, names, mandates, collectionForms, meansEntries] = await Promise.all([
    readers.buyers.buyersOf(payers),
    readers.reader.companyNames(payers),
    readers.mandates.activeFor(companies),
    readers.reader.collectionFormsAt(sites, at),
    readers.means.entriesOfPayers(periods.legalEntityId, payers),
  ]);
  const receivedOn = new Map(orders.map((order) => [order.orderId, order.receivedOn]));
  const means = PayersCollectionMeans.of(meansEntries);
  const collectionMeansOf = (payerId: string): CollectionMeans =>
    means.at(payerId, periods.periodStartOf(payerId));
  return { follows, buyers, names, mandates, collectionForms, receivedOn, collectionMeansOf };
}
