/** Ce que l'onglet « Factures » demande : les trois façons d'être une commande de la période. */
export interface ProcedureOrdersScope {
  /** Les factures 380 émises pour la clôture : leurs commandes en sont. */
  readonly periodInvoiceIds: readonly string[];
  /** L'assiette de l'émission, `[from, to[` — plancher et clôture. */
  readonly deliveredFrom: Date;
  readonly deliveredTo: Date;
  /** Jours demandés des commandes SANS jour de livraison : `[servedFrom, servedThrough]`… */
  readonly servedFrom: string;
  readonly servedThrough: string;
  /** … et strictement avant ce jour (`AAAA-MM-JJ`, aujourd'hui à Paris) : leur jour est passé. */
  readonly servedBefore: string;
}

/** Une commande lue pour l'onglet, avec ce qui décide de son statut. */
export interface ProcedureOrderRow {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly companyName: string;
  /** `AAAA-MM-JJ` ; `null` : aucun jour demandé. */
  readonly serviceDay: string | null;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly totalCents: number;
  /** La passation — ce qui choisit le payeur d'un site (`billedPayerOf`). */
  readonly placedAt: Date;
  readonly billedCompanyId: string | null;
  /** Le snapshot du retrait (`handed_over_at`) est posé. */
  readonly handedOver: boolean;
  /** `AAAA-MM-JJ` ; `null` : pas de jour de livraison. */
  readonly deliveredOn: string | null;
  /** La facture 380 qui la porte, quelle que soit sa période ; `null` sinon. */
  readonly invoice: { readonly invoiceId: string; readonly number: string } | null;
}

/**
 * **Les commandes d'une période de procédure** (onglet « Factures », Hugo,
 * 2026-10-24, § 12.4) — lecture seule, groupée : jamais une requête par
 * commande. Port à part (ISP) : ni l'émission, ni les bons à constater de
 * l'admin ne lisent ces trois branches ensemble.
 *
 * Une commande en est si l'une des trois est vraie :
 * 1. une facture de la clôture la porte ;
 * 2. elle est dans l'assiette de l'émission (`billableOrderWhere`) ;
 * 3. passée au compte, sans jour de livraison, son jour demandé est dans la
 *    période et passé.
 *
 * L'adaptateur ne décide rien d'autre : le tri par payeur et le statut
 * appartiennent à l'application et au domaine.
 */
export abstract class ProcedureOrdersReader {
  abstract ofPeriod(scope: ProcedureOrdersScope): Promise<readonly ProcedureOrderRow[]>;
}
