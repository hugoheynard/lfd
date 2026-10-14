/**
 * **« Le colisage de cette journée a-t-il commencé ? »** — port étroit que le
 * fournil DÉCLARE et que le colisage IMPLÉMENTE (réouverture d'une journée,
 * Hugo, 2026-10-14).
 *
 * Commencé = une commande au bac ou au sac : un contenant ouvert (même
 * annulé depuis), une ligne au bac, un bac fermé ou des contenants comptés.
 * La réouverture effacerait le plan sur lequel ce travail s'appuie : elle est
 * refusée. Une liste tirée que personne n'a touchée n'est pas un commencement.
 */
export abstract class DayPackingProgressReader {
  abstract startedOn(serviceDay: string): Promise<boolean>;
}
