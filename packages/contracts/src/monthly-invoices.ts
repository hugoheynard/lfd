/**
 * **La facture du mois**, telle que l'écran « Prélèvement du mois » la lit
 * (plan `documentation/comptabilite/facturation/facture-emise.md`).
 * Types seulement : aucune valeur, rien n'entre dans le paquet exécuté.
 * Montants en centimes.
 */

/** Une facture émise pour la période. */
export interface MonthlyInvoiceView {
  readonly invoiceId: string;
  /** `FA-AAAA-NNNNNN`. */
  readonly number: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** `AAAA-MM-JJ` — la veille de la clôture, ou le jour réel si émise après (jamais antidatée). */
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

/** Issue de la tentative automatique (une par clôture). */
export type MonthlyInvoiceAutopilotOutcomeView =
  "pending" | "issued" | "nothing_to_invoice" | "not_yet_open" | "failed";

export interface MonthlyInvoiceAutopilotRunView {
  /** ISO — la clôture tentée. */
  readonly periodClosesAt: string;
  /** ISO. */
  readonly ranAt: string;
  readonly outcome: MonthlyInvoiceAutopilotOutcomeView;
  readonly message: string | null;
}

/** `GET admin/accounting/monthly-invoices?legalEntityId=` */
export interface MonthlyInvoicesView {
  /**
   * ISO — la dernière clôture de l'entité dont l'heure d'émission est passée
   * (R3 : la période suit le rythme de l'entité, plus le mois civil).
   */
  readonly periodClosesAt: string;
  /** ISO — sa clôture précédente réelle : la période est `[periodStartsAt, periodClosesAt[`. */
  readonly periodStartsAt: string;
  /** « du 1er au 30 septembre 2026 » — jours locaux, dernier jour inclus. */
  readonly periodLabel: string;
  /** ISO — la veille de la clôture, 23h55 à Paris. */
  readonly issuableFrom: string;
  /** ISO — la mise en service ; `null` si la ligne a disparu (409 à l'émission). */
  readonly floorAt: string | null;
  /** La période se clôt après la mise en service : elle se facture. */
  readonly open: boolean;
  readonly invoices: readonly MonthlyInvoiceView[];
  readonly signaled: readonly MonthlyInvoiceSignalView[];
  /** La tentative automatique de CETTE clôture ; `null` s'il n'y en a pas eu. */
  readonly autopilotRun: MonthlyInvoiceAutopilotRunView | null;
}

/** `POST admin/accounting/monthly-invoices` — l'entité et la clôture sont demandées, jamais devinées. */
export interface IssueMonthlyInvoicesPayload {
  readonly legalEntityId: string;
  /** ISO — une clôture du rythme de l'entité (celle que rend `MonthlyInvoicesView`). */
  readonly periodClosesAt: string;
}

/** La réponse du bouton : ce que ce passage a fait. */
export interface MonthlyInvoiceReportView {
  /** ISO. */
  readonly periodClosesAt: string;
  /** ISO. */
  readonly periodStartsAt: string;
  readonly periodLabel: string;
  readonly issued: readonly {
    readonly payerCompanyId: string;
    readonly number: string;
    /** Après la veille de la clôture : émise en retard, ce jour-là. */
    readonly issuedOn: string;
  }[];
  readonly blocked: readonly { readonly payerCompanyId: string; readonly message: string }[];
  readonly alreadyInvoiced: number;
  readonly unbillableOrders: number;
}
