import type { OrderDeliveryHistoryReader } from "../../../delivery/channels/commerce/index.js";
import type { OrderHandoverHistoryReader } from "../../../handover/channels/commerce/index.js";
import type { StatementBuyer } from "../domain/entities/billing-statement.js";
import type { CollectionMandate } from "../domain/ports/collection-mandates.reader.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type { MonthlyInvoicingReader } from "../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import type { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";
import type { DossierStopFact } from "../domain/services/invoice-dossier-history.js";
import { deliveredOnOf, type MonthlyInvoicePlan } from "../domain/services/monthly-invoicing.js";
import type { CollectionFormName } from "../domain/value-objects/collection-form.js";

/**
 * Ce que la facture du mois lit UNE fois pour tous ses payeurs — jamais une
 * lecture par payeur, ni par bon (lot E4). Rien n'est écrit ici.
 */
export interface MonthlyContextReaders {
  readonly reader: MonthlyInvoicingReader;
  readonly buyers: StatementBuyerReader;
  readonly mandates: CollectionMandatesReader;
  /** Le retrait de chaque bon — déclaré et implémenté par `handover`. */
  readonly handovers: OrderHandoverHistoryReader;
  /** Les arrêts de chaque bon — déclaré et implémenté par `delivery`. */
  readonly deliveries: OrderDeliveryHistoryReader;
}

export interface MonthlyContext {
  readonly follows: readonly BillingFollow[];
  readonly buyers: ReadonlyMap<string, StatementBuyer>;
  readonly names: ReadonlyMap<string, string>;
  readonly mandates: readonly CollectionMandate[];
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  /** La date de livraison réelle de chaque bon, ou `null`. */
  readonly deliveredOn: ReadonlyMap<string, string | null>;
}

/**
 * @param at l'instant de l'émission : la forme de prélèvement d'un site y
 *        est lue, comme le lot la lit à sa clôture.
 */
export async function readMonthlyContext(
  readers: MonthlyContextReaders,
  plan: MonthlyInvoicePlan,
  follows: readonly BillingFollow[],
  at: Date,
): Promise<MonthlyContext> {
  const payers = plan.payers.map((payer) => payer.payerId);
  const orders = plan.payers.flatMap((payer) => payer.billable);
  const sites = unique(orders.map((order) => order.companyId));
  const companies = unique([...payers, ...sites]);
  const ids = orders.map((order) => order.orderId);
  const [buyers, names, mandates, collectionForms, handovers, stops] = await Promise.all([
    readers.buyers.buyersOf(payers),
    readers.reader.companyNames(payers),
    readers.mandates.activeFor(companies),
    readers.reader.collectionFormsAt(sites, at),
    readers.handovers.ofOrders(ids),
    readers.deliveries.ofOrders(ids),
  ]);
  const stopsOf = new Map<string, DossierStopFact[]>();
  for (const stop of stops) {
    stopsOf.set(stop.orderId, [...(stopsOf.get(stop.orderId) ?? []), stop]);
  }
  const deliveredOn = new Map(
    ids.map((id) => [id, deliveredOnOf(handovers.get(id) ?? null, stopsOf.get(id) ?? [])]),
  );
  return { follows, buyers, names, mandates, collectionForms, deliveredOn };
}

export function unique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
