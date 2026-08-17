/**
 * **Le cycle de vie d'une règle tarifaire.**
 *
 * Trois états, et deux gestes très différents pour les quitter :
 *
 * - **en vigueur** — elle s'applique quand sa fenêtre le dit ;
 * - **en pause** — elle ne s'applique plus, mais **elle garde sa place**. C'est
 *   le geste d'une promotion qu'on suspend un après-midi parce que le four est
 *   tombé en panne, et qu'on rallume le lendemain ;
 * - **archivée** — terminal. Elle ne s'applique plus, elle **libère sa place**,
 *   et plus rien ne peut lui arriver.
 *
 * La différence entre les deux sorties n'est pas cosmétique : c'est ce qui décide
 * si l'on peut poser une autre règle au même endroit. Une pause **réserve** le
 * créneau — sans quoi la reprise pourrait échouer sur un chevauchement que
 * personne n'a vu venir, et une promotion suspendue deviendrait irrécupérable.
 * Un archivage le **rend**. La contrainte d'exclusion de la base dit exactement
 * cela : elle est partielle, `WHERE archived_at IS NULL`.
 *
 * **Rien ne s'efface.** Une règle a facturé, elle a fait un prix ; la retirer de
 * la table effacerait la réponse à « pourquoi ce prix » alors que la facture,
 * elle, reste. Archiver garde la décision et sa provenance, et coûte une clause
 * dans deux requêtes.
 */

export type RuleStatus = "active" | "paused" | "archived";

/**
 * Ce que les gestes laissent derrière eux.
 *
 * Chaque sortie porte **qui** et **quand** — c'est tout l'intérêt : six mois
 * plus tard, la question posée n'est jamais « la promotion était-elle active ? »
 * mais « qui l'a arrêtée, et pourquoi ». Le motif n'est demandé qu'à
 * l'archivage : une pause est réversible et se raconte dans le journal, un
 * archivage est définitif et mérite sa phrase.
 */
export interface RuleLifecycle {
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/** L'état d'une règle qu'aucun geste n'a encore touchée. */
export const IN_FORCE: RuleLifecycle = {
  pausedAt: null,
  pausedBy: null,
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
};

/**
 * L'état lisible, dérivé et jamais stocké.
 *
 * Une colonne `status` en base aurait pu contredire ses propres dates — une
 * ligne « active » avec un `archived_at`. Un état dérivé ne peut pas mentir sur
 * ce qui l'a produit.
 *
 * L'archivage l'emporte sur la pause : il est terminal, et une règle archivée
 * pendant qu'elle était en pause reste archivée.
 */
export function statusOf(lifecycle: RuleLifecycle): RuleStatus {
  if (lifecycle.archivedAt !== null) {
    return "archived";
  }
  return lifecycle.pausedAt === null ? "active" : "paused";
}

/**
 * **L'instant à partir duquel la règle a cessé d'agir**, ou `null`.
 *
 * Un seul champ pour deux gestes, et c'est délibéré : le **calcul** du prix n'a
 * aucune raison de distinguer une pause d'un archivage. Les deux disent « cette
 * règle n'agit plus », et la différence — réserve-t-elle son créneau ? — ne
 * regarde que le staff et la base. Donner deux champs à la fonction pure aurait
 * été lui demander de rejouer une distinction qui ne change pas son résultat.
 *
 * Le **plus tôt** des deux gagne : une règle mise en pause puis archivée a cessé
 * d'agir à la pause, pas à l'archivage.
 */
export function suspendedFromOf(lifecycle: RuleLifecycle): Date | null {
  const { pausedAt, archivedAt } = lifecycle;
  if (pausedAt === null) {
    return archivedAt;
  }
  if (archivedAt === null) {
    return pausedAt;
  }
  return pausedAt.getTime() <= archivedAt.getTime() ? pausedAt : archivedAt;
}
