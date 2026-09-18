/**
 * Contrat de fil de la **cloche du back-office**.
 *
 * Socle **générique** : un sujet, une ligne, un lien, un état lu/non-lu. Les
 * alertes de compte en sont le premier consommateur ; les rendez-vous et les
 * demandes de contact le seront. Une cloche taillée pour un seul usage aurait été
 * à refaire au deuxième.
 *
 * Rien de la charge métier ne transite ici : ce qu'il faut afficher est **figé**
 * à l'émission. La cloche annonce, l'écran ciblé explique.
 */
export interface StaffNotificationView {
  readonly id: string;
  /** Nature du fait, ex. `alert.account` — sert au tri et à l'icône. */
  readonly kind: string;
  readonly subject: string;
  /** Une ligne, pas un rapport. */
  readonly body: string;
  /** Route interne à ouvrir. */
  readonly link: string;
  /** ISO. Temps du fait, pas de l'écriture. */
  readonly occurredAt: string;
  readonly readAt: string | null;
  /**
   * L'id de fiche du staff qui l'a lue (un `sub` avant le 2026-09-18), ou `null`.
   *
   * L'id de la fiche staff de l'auteur, ou une valeur qui ne désigne personne —
   * un marqueur (`system`, `seed-pim`…) ou un `sub` que la conversion n'a
   * rattaché à aucune fiche. L'écran affiche `readByName` et ne lit ce champ
   * que quand le nom manque.
   */
  readonly readBy: string | null;
  /**
   * « Prénom Nom » de l'auteur, résolu au serveur par l'annuaire. `null` =
   * la valeur ne désigne aucune fiche (marqueur, `sub` jamais lié) :
   * l'écran affiche alors `readBy` tel quel.
   */
  readonly readByName: string | null;
}

/** Ce que la cloche affiche sans ouvrir le panneau. */
export interface StaffNotificationsSummary {
  readonly unread: number;
  readonly notifications: readonly StaffNotificationView[];
}
