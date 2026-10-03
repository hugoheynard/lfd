/**
 * **Une liste d'échéances préférées**, telle que le carnet la tient : des
 * heures `HH:mm`, sans doublon, de la plus tôt à la plus tard (plan
 * composition automatique, CA3 — « plusieurs échéances par adresse »).
 *
 * L'ordre et l'unicité sont tenus PAR CONSTRUCTION à chaque geste, plutôt que
 * vérifiés à l'envoi : le contrat (`deadlineListSchema`) refuse une liste
 * désordonnée, et un formulaire qui la laisserait se former ferait lire un
 * refus pour une faute que personne n'a commise.
 *
 * Pur, sans Angular : le runner du paquet (Node) l'éprouve.
 */

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/u;

/** Une heure que le contrat accepte : `HH:mm`, de `00:00` à `23:59`. */
export function isDeadlineTime(time: string): boolean {
  return TIME_HHMM.test(time);
}

/**
 * Ajoute une échéance à sa place. Une heure déjà présente ou illisible laisse
 * la liste telle quelle : ajouter deux fois « avant 6 h » ne fait pas deux
 * livraisons.
 */
export function withDeadline(times: readonly string[], time: string): readonly string[] {
  if (!isDeadlineTime(time) || times.includes(time)) {
    return times;
  }
  return [...times, time].sort();
}

/** Retire une échéance ; une heure absente laisse la liste telle quelle. */
export function withoutDeadline(times: readonly string[], time: string): readonly string[] {
  return times.filter((candidate) => candidate !== time);
}
