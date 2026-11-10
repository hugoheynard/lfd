import type { InvoiceableOrder } from "../services/monthly-invoicing.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import type { BillingFollow } from "./statement-billing.reader.js";

/**
 * **Qui paie pour qui** : la seule part de la lecture de l'émission que
 * l'onglet « Factures » de la procédure lit aussi (2026-10-24). Un port à
 * part (ISP) : la procédure ne lit ni l'assiette restante, ni le plancher,
 * ni les formes de prélèvement, ni les factures émises.
 * L'adaptateur est le même — `MonthlyInvoicingReader` l'étend, et le module
 * relie l'un à l'autre (`useExisting`) : une règle, une traduction SQL.
 */
export abstract class BillingFollowsReader {
  /** Toutes les périodes `billing` de ces sociétés (le site suit son payeur). */
  abstract billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]>;
}

/**
 * Ce que lit **la facture du mois** (lot E4), et elle seule (ISP : toutes
 * ces méthodes lui servent). Le critère de l'assiette est celui du relevé et
 * du lot (`billable-order-criterion.ts`), moins les bons déjà facturés.
 */
export abstract class MonthlyInvoicingReader extends BillingFollowsReader {
  /**
   * Les bons passés au compte sur `[from, to[` qu'aucune facture (380) ne
   * porte encore, du plus ancien au plus récent.
   */
  abstract uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]>;

  /** La mise en service de la facture du mois ; `null` si la ligne a disparu. */
  abstract invoicingFloor(): Promise<Date | null>;

  /** La forme de prélèvement de ces sites en vigueur à `at` ; absent = `principal_mandate`. */
  abstract collectionFormsAt(
    companyIds: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, CollectionFormName>>;

  /** La raison sociale de ces sociétés. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /**
   * Les factures déjà émises par l'entité pour la période qui se clôt à
   * `periodClosesAt`, en clés `invoiceGroupKey` (payeur × mandat effectif, E4b).
   */
  abstract invoicedGroups(
    legalEntityId: string,
    periodClosesAt: Date,
  ): Promise<ReadonlySet<string>>;
}
