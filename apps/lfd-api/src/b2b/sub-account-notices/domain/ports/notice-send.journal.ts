/**
 * **Le journal d'envoi des avis au principal**
 * (`plan-notifications-sous-comptes.md`, §2) : une ligne par fait et par
 * destinataire, posée AVANT l'envoi, dans l'unité de travail de la garde du
 * relais. Une relivraison saute les destinataires déjà inscrits.
 */
export abstract class NoticeSendJournal {
  /**
   * Inscrit `(eventId, userId)`.
   *
   * @returns `true` si la ligne est neuve (envoyer), `false` si elle existait
   *   déjà (ce destinataire est servi : sauter).
   */
  abstract claim(eventId: string, userId: string, at: Date): Promise<boolean>;
}
