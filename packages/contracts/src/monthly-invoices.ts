import type { CollectionBatchStatusView } from "./collection-batch.js";
import type { BillingRhythmKind } from "./legal-entity.js";

/**
 * **La facture du mois**, telle que l'écran « Prélèvement du mois » la lit
 * (plan `documentation/comptabilite/facturation/facture-emise.md`).
 * Types seulement : aucune valeur, rien n'entre dans le paquet exécuté.
 * Montants en centimes.
 */

/** Une facture émise pour la période. */
export interface MonthlyInvoiceView {
  readonly invoiceId: string;
  /** `FA-<préfixe de l'entité>-AAAA-NNNNNN` (lot ZA). */
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

/** Un lot vivant ou passé d'une clôture, tel que la liste des clôtures le résume. */
export interface MonthlyClosureBatchView {
  readonly batchId: string;
  readonly scheme: "CORE" | "B2B";
  readonly status: CollectionBatchStatusView;
  /** « du 1er au 4 octobre 2026 » — la période du lot (`periodLabelOf`). */
  readonly periodLabel: string;
  readonly lineCount: number;
  readonly totalCents: number;
}

/**
 * **Une clôture du calendrier de l'entité** (plan
 * `plan-rythme-de-facturation.md`, §16.13, M4c) : sa période, les modes qui
 * s'y closent, les factures et les signalements de ses payeurs, ses lots.
 */
export interface MonthlyClosureView {
  /** ISO — la clôture. */
  readonly periodClosesAt: string;
  /**
   * ISO — le début de la période affichée : la PLUS LONGUE de celles qui s'y
   * closent (celle du mensuel au 1er quand un hebdomadaire clôt le même jour).
   */
  readonly periodStartsAt: string;
  /** « du 1er au 30 septembre 2026 » — jours locaux, dernier jour inclus. */
  readonly periodLabel: string;
  /**
   * Les modes dont des payeurs closent ici, mensuel d'abord. Le mensuel y est
   * dès que sa date tombe ici : c'est le mode de quiconque n'a rien choisi.
   */
  readonly modes: readonly BillingRhythmKind[];
  /** ISO — la veille de la clôture, 23h55 à Paris. */
  readonly issuableFrom: string;
  /** L'heure d'émission est passée : le bouton peut émettre ou reprendre. */
  readonly reached: boolean;
  /** ISO — la mise en service ; `null` si la ligne a disparu (409 à l'émission). */
  readonly floorAt: string | null;
  /** La période se clôt après la mise en service : elle se facture. */
  readonly open: boolean;
  readonly invoices: readonly MonthlyInvoiceView[];
  readonly signaled: readonly MonthlyInvoiceSignalView[];
  /** La tentative automatique de CETTE clôture ; `null` s'il n'y en a pas eu. */
  readonly autopilotRun: MonthlyInvoiceAutopilotRunView | null;
  /** Les lots clos à cet instant (un par schéma), annulés compris ; vide s'il n'y en a pas. */
  readonly batches: readonly MonthlyClosureBatchView[];
}

/**
 * `GET admin/accounting/monthly-invoices?legalEntityId=` — la clôture dont on
 * émet les factures maintenant (la dernière dont l'heure d'émission est
 * passée, R3), et depuis M4c la liste des clôtures du mois en cours.
 */
export interface MonthlyInvoicesView extends MonthlyClosureView {
  /**
   * Les clôtures du calendrier tombées dans le mois en cours (Paris), plus la
   * dernière atteinte et celle dont on émet les factures si elles n'y sont
   * pas — la plus ancienne d'abord.
   */
  readonly closures: readonly MonthlyClosureView[];
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
