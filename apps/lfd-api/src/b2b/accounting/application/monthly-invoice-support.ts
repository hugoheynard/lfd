import type { StatementBuyer } from "../domain/entities/billing-statement.js";
import type { CollectionMandate } from "../domain/ports/collection-mandates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { MonthlyInvoicingReader } from "../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import type { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";
import type { PayerOrders } from "../domain/services/monthly-invoicing.js";
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
}

export interface MonthlyContext {
  readonly follows: readonly BillingFollow[];
  readonly buyers: ReadonlyMap<string, StatementBuyer>;
  readonly names: ReadonlyMap<string, string>;
  readonly mandates: readonly CollectionMandate[];
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  /**
   * La date de livraison de chaque bon : `orders.delivered_on`, celle qui l'a
   * fait entrer dans l'assiette (lot ZL) — plus recalculée depuis les faits
   * du retrait et de la tournée à l'émission, pour que « livré le … » et le
   * mois de la facture ne puissent pas diverger.
   */
  readonly deliveredOn: ReadonlyMap<string, string | null>;
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
): Promise<MonthlyContext> {
  const payers = payerOrders.map((payer) => payer.payerId);
  // Tous les bons, non facturables compris : leur mandat range aussi les
  // bons signalés dans la facture de leur mandat (E4b).
  const orders = payerOrders.flatMap((payer) => payer.orders);
  const sites = unique(orders.map((order) => order.companyId));
  const companies = unique([...payers, ...sites]);
  const [buyers, names, mandates, collectionForms] = await Promise.all([
    readers.buyers.buyersOf(payers),
    readers.reader.companyNames(payers),
    readers.mandates.activeFor(companies),
    readers.reader.collectionFormsAt(sites, at),
  ]);
  const deliveredOn = new Map(orders.map((order) => [order.orderId, order.deliveredOn]));
  return { follows, buyers, names, mandates, collectionForms, deliveredOn };
}
