/** Le numéro d'UN sujet, et l'instant où sa lecture en base a COMMENCÉ. */
export interface SubjectReading {
  readonly version: number;
  /** Millisecondes du mur au DÉBUT de la lecture en base. */
  readonly readAtMs: number;
}

/**
 * **La carte d'une portée** — une journée `AAAA-MM-JJ`, ou {@link GLOBAL_SCOPE} —
 * telle qu'elle a été lue en base : le numéro de chaque sujet de la portée,
 * jamais une réponse filtrée par droit (`plan-veilleur-unique.md`, § 3.3).
 *
 * Chaque sujet porte SON instant de lecture : un sujet à 30 s n'oblige pas à
 * relire un sujet à 15 s. Les clés sont des chaînes et non des sujets typés :
 * une carte rangée par une autre révision peut nommer un sujet que celle-ci
 * ne connaît pas, ou en omettre un — c'est la lecture qui le relit alors.
 */
export interface VersionsCard {
  readonly subjects: Readonly<Record<string, SubjectReading>>;
}

/** La clé de la portée des sujets globaux — jamais une journée. */
export const GLOBAL_SCOPE = "global";

/**
 * **Le cache partagé des numéros** — lu et rangé par l'API, implémenté par
 * l'objet `DayVersions` du conteneur (ou absent). Une carte par portée.
 *
 * La révision du code est dans la clé, posée par l'adaptateur : une carte
 * rangée par une autre image n'est jamais lue. Un rangement se FUSIONNE à la
 * carte gardée, sujet par sujet : un numéro ne remplace le gardé que s'il a
 * été lu plus récemment — c'est l'objet qui en décide.
 *
 * Peut lever : une panne ou une réponse illisible remonte telle quelle, et
 * c'est le repli ({@link ResilientDayVersionsCache}) qui la traduit en « lis
 * la base ».
 */
export abstract class DayVersionsCache {
  /** La carte gardée pour cette portée, `null` s'il n'y en a pas. */
  abstract read(scope: string): Promise<VersionsCard | null>;

  /** Présente des numéros au rangement ; un numéro plus ancien que le gardé est ignoré. */
  abstract store(scope: string, card: VersionsCard): Promise<void>;
}
