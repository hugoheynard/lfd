import type { CollectionBatchStatusView } from "./collection-batch.js";
import type { InvoiceDossierInvoiceView } from "./invoice-dossier.js";

/**
 * **L'arrêté de facturation figé**, tel que l'écran le relit (plan
 * `documentation/facturation/plan-le-prelevement-suit-la-facture.md`, F4).
 *
 * Une relecture, jamais un recalcul : la facture est le `body` figé à la
 * constitution du lot, les totaux sont ceux de la ligne. C'est ce total TTC
 * que la ligne de débit prélève. Montants en centimes.
 *
 * ⚠️ Des interfaces seulement, comme `invoice-dossier.ts` : la route n'a pas
 * de payload, rien à valider à l'exécution.
 */

export type BillingStatementStatusView = "active" | "cancelled";

/** Le vendeur figé : ce qu'une facture imprime de l'émetteur. */
export interface BillingStatementSellerView {
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  readonly addressLines: readonly string[];
  readonly ics: string;
}

/** L'acheteur figé : la fiche de la société payeuse au jour de la constitution. */
export interface BillingStatementBuyerView {
  readonly companyId: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siret: string;
  readonly siren: string;
  readonly vatNumber: string;
  /** Vide quand la fiche n'avait pas d'adresse de facturation. */
  readonly billingAddressLines: readonly string[];
}

/** Un bon couvert par l'arrêté. */
export interface BillingStatementOrderView {
  readonly orderId: string;
  /** `null` si la commande n'est plus lisible — l'identifiant reste. */
  readonly orderNumber: string | null;
}

export interface BillingStatementView {
  readonly id: string;
  readonly batchId: string;
  readonly lineRank: number;
  readonly status: BillingStatementStatusView;
  /** L'état du lot : un arrêté d'un lot déposé ne changera plus. */
  readonly batchStatus: CollectionBatchStatusView;
  readonly seller: BillingStatementSellerView;
  readonly buyer: BillingStatementBuyerView;
  /** `AAAA-MM-JJ` — le jour (Paris) de la constitution. */
  readonly issuedOn: string;
  /** `AAAA-MM-JJ`, ou `null` quand aucun bon ne portait de date de livraison. */
  readonly periodStartsOn: string | null;
  readonly periodEndsOn: string | null;
  readonly totalHtCents: number;
  readonly totalVatCents: number;
  /** Ce que la ligne prélève. */
  readonly totalTtcCents: number;
  /** Σ des totaux des bons couverts. */
  readonly ordersTotalCents: number;
  /** La facture figée (`body`), telle quelle. */
  readonly invoice: InvoiceDossierInvoiceView;
  readonly bodyVersion: number;
  readonly computedWith: string;
  /** Dans l'ordre des numéros. */
  readonly orders: readonly BillingStatementOrderView[];
}
