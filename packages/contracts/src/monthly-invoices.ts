import type { BudgetCommitmentView } from "./budget-commitment.js";
import type { ChorusDepositStatusView } from "./chorus-deposit.js";
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
  /**
   * L'engagement budgétaire de la facture (organisme public, une facture par
   * engagement) ; absent pour toute facture sans engagement.
   */
  readonly budgetCommitment?: BudgetCommitmentView;
  /**
   * L'état Chorus d'une facture d'organisme public et son échéance effective
   * (plan `plan-clients-publics-chorus.md`, T3′) ; absent pour toute autre.
   */
  readonly chorus?: ChorusDepositStatusView;
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
  /** L'engagement de la facture qui n'est pas partie ; absent sans engagement. */
  readonly budgetCommitment?: BudgetCommitmentView;
  /** Le refus, en clair — il nomme le geste de sortie. */
  readonly message: string;
  readonly unbillableOrders: readonly string[];
  /** ISO — la dernière tentative. */
  readonly recordedAt: string;
}

/**
 * **Un devis de période en attente** de son numéro d'engagement (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD3) : la clôture a rangé les
 * commandes d'un payeur public dans ce devis au lieu d'en émettre la facture.
 */
export interface MonthlyPeriodQuoteView {
  readonly quoteId: string;
  /** `D-<AAAAMMJJ>-<rang>` — partagé par les versions d'un même devis. */
  readonly number: string;
  readonly version: number;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Le code service des commandes ; `null` sans code. */
  readonly serviceCode: string | null;
  /** TTC de la facture à venir, en centimes. */
  readonly totalCents: number;
  readonly orderCount: number;
  /** ISO — le rangement de cette version. */
  readonly createdAt: string;
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
  /**
   * Les devis de période EN ATTENTE de cette clôture (P2 bis) : leurs payeurs
   * n'ont ni facture ni signalement, ils attendent leur numéro d'engagement.
   * Absent d'une réponse d'avant le devis ; le serveur le sert toujours.
   */
  readonly periodQuotes?: readonly MonthlyPeriodQuoteView[];
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
  /** Devis de période rangés par ce passage (P2 bis) ; absent d'une réponse d'avant. */
  readonly quoted?: number;
}
