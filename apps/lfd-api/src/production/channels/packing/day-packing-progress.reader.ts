/**
 * **« Le colisage de cette journée a-t-il commencé ? »** — port étroit que le
 * fournil DÉCLARE et que le colisage IMPLÉMENTE (réouverture d'une journée,
 * Hugo, 2026-10-14).
 *
 * Commencé = une commande au bac ou au sac : un contenant ouvert (même
 * annulé depuis), une ligne au bac, un bac fermé ou des contenants comptés.
 * La réouverture effacerait le plan sur lequel ce travail s'appuie : elle est
 * refusée. Une liste tirée que personne n'a touchée n'est pas un commencement.
 *
 * Appelé SOUS le verrou exclusif de la journée (2026-11-02), dans la
 * transaction de la réouverture : l'implémentation ne lit qu'en `SELECT`
 * simple, sans prendre de verrou chez elle — sans quoi elle pourrait attendre
 * un geste qui attend lui-même le verrou de la journée (`ArrestedPlanHold`).
 */
export abstract class DayPackingProgressReader {
  abstract startedOn(serviceDay: string): Promise<boolean>;
}
