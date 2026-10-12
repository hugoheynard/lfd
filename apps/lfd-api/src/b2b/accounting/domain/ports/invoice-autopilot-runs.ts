/**
 * L'issue d'une tentative du passage automatique de la facture du mois (E4) :
 * - `pending` : prise, issue pas encore écrite (ou processus mort entre les deux) ;
 * - `issued` : au moins une facture émise (d'autres payeurs ont pu être signalés) ;
 * - `nothing_to_invoice` : aucun bon à facturer, ou tous signalés ;
 * - `not_yet_open` : la période se clôt avant la mise en service ;
 * - `failed` : la facture du mois a refusé ou cassé — le message dit pourquoi.
 */
export type InvoiceAutopilotOutcome =
  "pending" | "issued" | "nothing_to_invoice" | "not_yet_open" | "failed";

export type SettledInvoiceAutopilotOutcome = Exclude<InvoiceAutopilotOutcome, "pending">;

/**
 * **UNE tentative par (entité, clôture)** (R3) — même mécanique que
 * `CollectionAutopilotRuns` : la base départage deux passages sur
 * l'insertion. Le bouton de la comptabilité, lui, peut toujours rejouer.
 */
export abstract class InvoiceAutopilotRuns {
  abstract attempted(legalEntityId: string, periodClosesAt: Date): Promise<boolean>;

  /**
   * La clôture la plus récente déjà tentée pour l'entité, ou `null` : d'où le
   * rattrapage repart.
   */
  abstract lastAttempted(legalEntityId: string): Promise<Date | null>;

  /** Prend la tentative. `false` : un autre passage l'a prise. */
  abstract claim(legalEntityId: string, periodClosesAt: Date, at: Date): Promise<boolean>;

  abstract settle(
    legalEntityId: string,
    periodClosesAt: Date,
    outcome: SettledInvoiceAutopilotOutcome,
    message: string | null,
  ): Promise<void>;
}
