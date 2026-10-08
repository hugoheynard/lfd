import type { InvoiceableOrder } from "../services/monthly-invoicing.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import type { BillingFollow } from "./statement-billing.reader.js";

/**
 * Ce que lit **la facture du mois** (lot E4), et elle seule (ISP : toutes
 * ces méthodes lui servent). Le critère de l'assiette est celui du relevé et
 * du lot (`billable-order-criterion.ts`), moins les bons déjà facturés.
 */
export abstract class MonthlyInvoicingReader {
  /** La mise en service de la facture du mois ; `null` si la ligne a disparu. */
  abstract invoicingFloor(): Promise<Date | null>;

  /**
   * Les bons passés au compte sur `[from, to[` qu'aucune facture (380) ne
   * porte encore, du plus ancien au plus récent.
   */
  abstract uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]>;

  /** Toutes les périodes `billing` de ces sociétés (le site suit son payeur). */
  abstract billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]>;

  /** La forme de prélèvement de ces sites en vigueur à `at` ; absent = `principal_mandate`. */
  abstract collectionFormsAt(
    companyIds: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, CollectionFormName>>;

  /** La raison sociale de ces sociétés. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** Les payeurs déjà facturés par l'entité pour ce mois (`AAAA-MM`). */
  abstract invoicedPayers(legalEntityId: string, month: string): Promise<ReadonlySet<string>>;
}
