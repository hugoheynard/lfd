/**
 * Ce qui, dans un réglage de l'entité émettrice, rend ses brouillons caducs.
 *
 * - `mandate_scheme_changed` : CORE ↔ interentreprises — un autre formulaire,
 *   un autre droit au remboursement ;
 * - `mandate_defaults_changed` : le type de paiement (zone 12), ou la
 *   description du contrat (zone 20) sous un émetteur CORE, seul à l'imprimer.
 */
export type IssuerDraftVoidingCause = "mandate_scheme_changed" | "mandate_defaults_changed";

/** Qui a écrit le réglage. Les réglages de l'entité sont un geste staff. */
export type IssuerDraftVoidingChannel = "staff";

/** Un brouillon révoqué, tel que l'appelant a besoin de le nommer — rien de plus. */
export interface VoidedDraftMandate {
  readonly id: string;
  readonly companyId: string;
  readonly reference: string;
}

/**
 * Port d'**écriture** des brouillons émis par une entité, déclaré par la
 * comptabilité et implémenté par `payments` (plan
 * `documentation/comptabilite/plan-mandat-deux-schemas.md` §9 objection 8).
 *
 * 🔴 Un port, et pas un import : les mandats appartiennent à `payments`, qui
 * importe déjà `accounting`. Faire charger et révoquer des `PaymentMandate`
 * depuis ici ferait se tenir les deux contextes l'un l'autre.
 *
 * ## Deux temps, parce que la transaction et la cloche n'ont pas le même sort
 *
 * `voidDraftsOf` s'appelle DANS l'unité de travail du réglage : la révocation et
 * son fait tombent avec lui. `announceVoided` s'appelle APRÈS : une cloche en
 * panne ne doit jamais annuler un réglage déjà écrit — c'est la règle de
 * `ringDraftVoided`, et le port la rend visible au lieu de la cacher.
 */
export abstract class IssuedDraftMandates {
  /**
   * Révoque **tous** les brouillons émis par cette entité, et journalise chaque
   * révocation avec sa cause. Les mandats actifs ne sont pas touchés : ils ont
   * figé leur schéma et leur type à la frappe.
   *
   * @returns les brouillons révoqués — vide s'il n'y en avait aucun.
   */
  abstract voidDraftsOf(
    creditorId: string,
    cause: IssuerDraftVoidingCause,
    via: IssuerDraftVoidingChannel,
  ): Promise<readonly VoidedDraftMandate[]>;

  /** Prévient l'équipe, brouillon par brouillon, **sans jamais échouer**. */
  abstract announceVoided(
    voided: readonly VoidedDraftMandate[],
    cause: IssuerDraftVoidingCause,
  ): Promise<void>;
}
