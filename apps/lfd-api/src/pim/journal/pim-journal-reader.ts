import type { PimSubjectType } from "./pim-journal.js";

/** Un fait du journal, tel qu'on le RELIT — l'écriture a sa propre forme. */
export interface PimJournalFact {
  readonly type: string;
  /** De quoi le fait parle. Un taux, une famille — pas forcément un produit. */
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  /**
   * Le nom de l'auteur, **tel qu'il était au moment de l'acte**.
   *
   * Un instantané, pas une jointure : quelqu'un qui change de nom ne réécrit pas
   * l'histoire, et quelqu'un qui part ne l'efface pas. `null` = acte du système
   * (un seed, un cron), et il faut pouvoir le dire plutôt que d'inventer un
   * responsable.
   */
  readonly actorName: string | null;
  readonly payload: unknown;
}

/**
 * Port de **lecture** du journal, côté référentiel.
 *
 * Symétrique de `PimJournal`, qui n'écrit que. Il existe pour une question
 * précise : « qui a changé ce champ, et quand ». Y répondre demande de relire
 * les faits d'un sujet sur un intervalle — ce qu'aucun écran ne peut faire en
 * interrogeant la table lui-même sans franchir un schéma.
 */
export abstract class PimJournalReader {
  /**
   * Les faits d'un sujet dans un intervalle, **du plus récent au plus ancien**.
   *
   * L'ordre est celui de la question : « qui a fait ça » veut dire « qui l'a
   * fait EN DERNIER ». Un appelant qui trierait à l'envers attribuerait la
   * première modification au lieu de la dernière, et personne ne le verrait.
   *
   * `since` est EXCLUSIF, `until` inclusif : un fait daté de l'ancre de départ
   * appartient à ce qu'elle a figé, pas à ce qui s'est passé depuis.
   */
  abstract factsAbout(
    subjectType: PimSubjectType,
    subjectId: string,
    since: Date,
    until: Date,
  ): Promise<readonly PimJournalFact[]>;

  /**
   * Les faits d'un intervalle **quel que soit leur sujet**, filtrés par type.
   *
   * Il existe pour les causes GLOBALES : changer un taux de TVA est un seul
   * fait, sur un seul sujet, qui altère le prix de cent articles. Les chercher
   * produit par produit ne les trouverait jamais — le fait ne parle d'aucun
   * produit — et l'écran dirait cent fois « auteur non défini par une action locale »
   * pour une décision
   * que quelqu'un a prise une fois, en connaissance de cause.
   *
   * Même ordre que {@link factsAbout} : du plus récent au plus ancien.
   */
  abstract factsBetween(
    types: readonly string[],
    since: Date,
    until: Date,
  ): Promise<readonly PimJournalFact[]>;
}
