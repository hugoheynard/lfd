/**
 * **La carte des numéros d'une journée, telle qu'elle a été lue en base** :
 * le numéro de CHAQUE journal du registre, jamais une réponse filtrée par
 * droit, et l'instant où la lecture a COMMENCÉ (`plan-objet-des-journees.md`,
 * § 3 bis).
 *
 * Les clés sont des chaînes et non des `DayJournal` : une carte rangée par
 * une autre révision peut nommer un journal que celle-ci ne connaît pas, ou
 * en omettre un — c'est le handler qui la juge complète ou non.
 */
export interface DayVersionsCard {
  readonly versions: Readonly<Record<string, number>>;
  /** Millisecondes du mur au DÉBUT de la lecture en base. */
  readonly readAtMs: number;
}

/**
 * **Le cache partagé des numéros de journée** — lu et rangé par l'API,
 * implémenté par l'objet `DayVersions` du conteneur (ou absent).
 *
 * La révision du code est dans la clé, posée par l'adaptateur : une carte
 * rangée par une autre image n'est jamais lue. Une carte ne remplace la carte
 * gardée que si elle a été lue plus récemment — c'est l'objet qui en décide.
 *
 * Peut lever : une panne ou une réponse illisible remonte telle quelle, et
 * c'est le repli ({@link ResilientDayVersionsCache}) qui la traduit en « lis
 * la base ».
 */
export abstract class DayVersionsCache {
  /** La carte gardée pour cette journée, `null` s'il n'y en a pas. */
  abstract read(serviceDay: string): Promise<DayVersionsCard | null>;

  /** Présente une carte au rangement ; une carte plus ancienne que la gardée est ignorée. */
  abstract store(serviceDay: string, card: DayVersionsCard): Promise<void>;
}
