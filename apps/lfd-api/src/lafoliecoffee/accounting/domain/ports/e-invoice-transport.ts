/** Une facture émise, telle qu'un transport la prend : son identité, rien d'autre. */
export interface TransmittedInvoice {
  readonly invoiceId: string;
  readonly number: string;
}

/**
 * **Le transport d'une facture électronique vers le portail de l'acheteur
 * public** (plan `plan-clients-publics-chorus.md`, D8, T4).
 *
 * Aujourd'hui un seul adaptateur, `ManualChorusDeposit` : « transmettre »,
 * c'est laisser la facture dans la file « À déposer », que la comptabilité
 * vide à la main sur Chorus Pro — rien n'est envoyé. L'adaptateur de la
 * plateforme agréée (P4) se branchera sur ce même port et écrira lui-même les
 * lignes de dépôt.
 */
export abstract class EInvoiceTransport {
  abstract transmit(invoice: TransmittedInvoice): Promise<void>;
}
