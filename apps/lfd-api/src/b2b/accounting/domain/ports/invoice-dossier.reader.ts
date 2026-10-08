import type { BillingCycle } from "../services/billing-cycle.js";
import type { DossierOrderPlace, FrozenInvoiceOrder } from "../services/invoice-dossier.types.js";

/** Un bon du dossier, avec ce qu'il faut pour savoir qui le paie. */
export interface InvoiceDossierOrder {
  /** L'identifiant de la commande — la clé que le retrait et la livraison connaissent. */
  readonly orderId: string;
  /** La société qui a commandé (`company_id`). */
  readonly companyId: string;
  /** Le payeur copié à la passation (S4), `null` pour une commande d'avant. */
  readonly billedCompanyId: string | null;
  /** Le bon tel que figé — `reference` est son `orderNumber`. */
  readonly order: FrozenInvoiceOrder;
  /** Où le bon se retire ou se livre. */
  readonly place: DossierOrderPlace;
}

/**
 * **Les bons d'un dossier de facturation, lignes comprises** (plan
 * `simulateur-dossier-de-facturation.md`).
 *
 * Un port à part de `CycleOrdersReader`, qui reste étroit par choix : le relevé
 * n'a l'usage ni des lignes, ni de la date demandée, ni du mode de TVA du port
 * (ISP). Le CRITÈRE, lui, est le même (`billable-order-criterion.ts`) — un
 * dossier qui ne retomberait pas sur le relevé ne servirait pas à le rapprocher.
 */
export abstract class InvoiceDossierReader {
  /** La raison sociale de la société du dossier, ou `null` si elle n'existe pas. */
  abstract dossierCompanyName(companyId: string): Promise<string | null>;

  /**
   * Les bons passés au compte par ces sociétés (ou payés par elles) sur
   * `[startsAt, closesAt[`, du plus ancien au plus récent. Le tri par payeur
   * est fait par le domaine (`billedPayerOf`), comme au relevé.
   */
  abstract dossierOrders(
    companyIds: readonly string[],
    cycle: BillingCycle,
  ): Promise<readonly InvoiceDossierOrder[]>;
}
