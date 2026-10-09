/**
 * **La facture du mois**, telle que l'écran « Prélèvement du mois » la lit
 * (plan `documentation/comptabilite/facturation/facture-emise.md`).
 * Types seulement : aucune valeur, rien n'entre dans le paquet exécuté.
 * Montants en centimes.
 */

/** Une facture émise pour le mois. */
export interface MonthlyInvoiceView {
  readonly invoiceId: string;
  /** `FA-AAAA-NNNNNN`. */
  readonly number: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** `AAAA-MM-JJ` — le dernier jour du mois, ou le jour réel si émise après (jamais antidatée). */
  readonly issuedOn: string;
  /** `AAAA-MM-JJ` — la date de prélèvement annoncée. */
  readonly dueOn: string | null;
  readonly totalCents: number;
  readonly orderCount: number;
  /** La RUM figée (BG-16) — une facture par mandat (E4b) ; `null` : bons sans mandat effectif. */
  readonly mandateReference: string | null;
  /** Bons du payeur signalés non facturables, laissés hors de la facture. */
  readonly unbillableOrders: readonly string[];
}

/** Un payeur signalé : sa facture n'est pas partie, et pourquoi. */
export interface MonthlyInvoiceSignalView {
  readonly payerCompanyId: string;
  readonly payerName: string;
  /**
   * La RUM du mandat dont la facture n'est pas partie (E4b : une facture par
   * payeur ET par mandat) ; `null` pour les bons sans mandat.
   */
  readonly mandateReference: string | null;
  /** Le refus, en clair — il nomme le geste de sortie. */
  readonly message: string;
  readonly unbillableOrders: readonly string[];
  /** ISO — la dernière tentative. */
  readonly recordedAt: string;
}

/** Issue de la tentative automatique (une par mois). */
export type MonthlyInvoiceAutopilotOutcomeView =
  "pending" | "issued" | "nothing_to_invoice" | "not_yet_open" | "failed";

export interface MonthlyInvoiceAutopilotRunView {
  /** `AAAA-MM`. */
  readonly month: string;
  /** ISO. */
  readonly ranAt: string;
  readonly outcome: MonthlyInvoiceAutopilotOutcomeView;
  readonly message: string | null;
}

/** `GET admin/accounting/monthly-invoices?legalEntityId=` */
export interface MonthlyInvoicesView {
  /** `AAAA-MM` — le dernier mois dont l'heure d'émission est passée. */
  readonly month: string;
  /** ISO — le dernier jour du mois, 23h55 à Paris. */
  readonly issuableFrom: string;
  /** ISO — la mise en service ; `null` si la ligne a disparu (409 à l'émission). */
  readonly floorAt: string | null;
  /** Le mois se clôt après la mise en service : il se facture. */
  readonly open: boolean;
  readonly invoices: readonly MonthlyInvoiceView[];
  readonly signaled: readonly MonthlyInvoiceSignalView[];
  /** La tentative automatique de CE mois ; `null` s'il n'y en a pas eu. */
  readonly autopilotRun: MonthlyInvoiceAutopilotRunView | null;
}

/** `POST admin/accounting/monthly-invoices` — l'entité et le mois sont demandés, jamais devinés. */
export interface IssueMonthlyInvoicesPayload {
  readonly legalEntityId: string;
  /** `AAAA-MM`. */
  readonly month: string;
}

/** La réponse du bouton : ce que ce passage a fait. */
export interface MonthlyInvoiceReportView {
  readonly month: string;
  readonly issued: readonly {
    readonly payerCompanyId: string;
    readonly number: string;
    /** Après le mois : émise en retard, ce jour-là. */
    readonly issuedOn: string;
  }[];
  readonly blocked: readonly { readonly payerCompanyId: string; readonly message: string }[];
  readonly alreadyInvoiced: number;
  readonly unbillableOrders: number;
}
