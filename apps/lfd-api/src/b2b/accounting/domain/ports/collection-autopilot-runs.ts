/**
 * L'issue d'une tentative de la constitution automatique (PA3) :
 * - `pending` : prise, issue pas encore écrite (ou processus mort entre les deux) ;
 * - `constituted` : au moins un lot préparé, ses avis en file ;
 * - `nothing_to_collect` : rien à prélever, ou seulement des commandes écartées ;
 * - `not_yet_open` : le cycle se clôt avant la mise en service (plancher) ;
 * - `failed` : la constitution a refusé ou cassé — le message dit pourquoi.
 */
export type CollectionAutopilotOutcome =
  "pending" | "constituted" | "nothing_to_collect" | "not_yet_open" | "failed";

/** Une issue tranchée — tout sauf `pending`. */
export type SettledAutopilotOutcome = Exclude<CollectionAutopilotOutcome, "pending">;

/**
 * **La trace des tentatives de l'automatisme** — UNE par (entité, clôture),
 * jamais deux (plan `prelevement-automatique.md`, PA3, et `vitruve` § 8 :
 * « l'automatisme reconstituait un lot que la compta venait d'annuler »).
 *
 * C'est la base qui décide qui tente : deux passages simultanés se
 * départagent sur l'insertion, pas sur une lecture. La lecture qui précède
 * (`attempted`) ne sert qu'à ce que le passage horaire se taise.
 */
export abstract class CollectionAutopilotRuns {
  /** Ce cycle a-t-il déjà été tenté pour cette entité, quelle qu'en soit l'issue ? */
  abstract attempted(legalEntityId: string, cycleClosesAt: Date): Promise<boolean>;

  /** Prend la tentative. `false` : un autre passage l'a prise — ne rien faire. */
  abstract claim(legalEntityId: string, cycleClosesAt: Date, at: Date): Promise<boolean>;

  /** Écrit l'issue. `message` : obligatoire en `failed`, explicatif sinon. */
  abstract settle(
    legalEntityId: string,
    cycleClosesAt: Date,
    outcome: SettledAutopilotOutcome,
    message: string | null,
  ): Promise<void>;
}
