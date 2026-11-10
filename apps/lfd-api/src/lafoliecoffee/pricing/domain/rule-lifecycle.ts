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

/**
 * **L'instant où une décision a cessé d'agir**, ou `null` s'il ne faut RIEN
 * borner.
 *
 * ## Pourquoi ranger doit écrire dans la FENÊTRE
 *
 * `archived_at` disait deux choses à la fois : « rangée de l'écran » et « elle
 * n'agit plus ». La seconde ne se lisait que par ce champ, et la clause
 * `archived_at IS NULL` des lecteurs la transformait en **disparition** — une
 * décision en vigueur le 3 mars, rangée en avril, devenait introuvable pour une
 * lecture datée du 3 mars, alors que quatre affirmations du dépôt promettaient
 * cette lecture (R17, 2026-09-09).
 *
 * Ranger écrit donc aussi la fin dans la fenêtre, qui est l'endroit où le
 * domaine la lit déjà ({@link isInForce}). `archived_at` retrouve son seul
 * rôle : ce qui est rangé de l'écran, et ce qui rend sa place dans la contrainte
 * d'exclusion partielle.
 *
 * ## Les trois `null` valent autant que la valeur
 *
 * Ce ne sont pas des cas dégénérés : ce sont ceux où la fenêtre dit **déjà** la
 * vérité, et où l'écrire la falsifierait.
 *
 * | Cas | Réponse | Pourquoi |
 * | --- | --- | --- |
 * | `validFrom >= at` | `null` | elle n'a jamais agi. Borner donnerait `validTo <= validFrom`, que `tstzrange` refuse en **22000** — que `isExclusionViolation` n'attrape pas, puisqu'il compare un NOM de contrainte. Un **500** sur un geste de staff |
 * | déjà terminée | `null` | sa fenêtre porte déjà sa fin ; la repousser à `at` la **ressusciterait** sur l'intervalle écoulé. C'est le cas le plus courant : on range ce qui est fini |
 * | suspendue avant d'agir | `null` | même raison que le premier cas |
 * | suspendue **pendant** | `suspendedFrom` | elle s'est arrêtée là, pas au rangement — sinon `[pause, rangement[` resterait occupé par une décision qui ne s'y appliquait pas, et le staff se verrait refuser une remplaçante sur une période où rien ne courait |
 *
 * ⚠️ `validFrom >= at` est une comparaison **large**, et l'égalité est le cas,
 * pas la limite : borner à `validFrom` produirait une plage **vide**, et une
 * plage vide n'est `&&` avec rien — la ligne échapperait entièrement à la
 * contrainte d'exclusion.
 */
export function closingWindowAt(
  window: { readonly validFrom: Date; readonly validTo: Date | null },
  suspendedFrom: Date | null,
  at: Date,
): Date | null {
  const { validFrom, validTo } = window;
  if (validFrom.getTime() >= at.getTime()) {
    return null;
  }
  if (validTo !== null && validTo.getTime() <= at.getTime()) {
    return null;
  }
  if (suspendedFrom === null) {
    return at;
  }
  if (suspendedFrom.getTime() <= validFrom.getTime()) {
    return null;
  }
  return suspendedFrom.getTime() < at.getTime() ? suspendedFrom : at;
}
