/**
 * La garde d'unicité des référentiels : le regard « quelqu'un porte déjà cette
 * valeur ? » que la base ne sait faire qu'en renvoyant un code Postgres.
 *
 * Elle est unique parce qu'elle était recopiée cinq fois, chaque copie avec sa
 * propre façon d'exclure l'objet qu'on modifie — et une exclusion oubliée refuse
 * de renommer un objet pour son propre nom. L'appelant garde la lecture (son port)
 * et le choix de l'erreur ; la garde ne porte que la règle : un porteur autre que
 * soi-même refuse.
 *
 * @param holder le porteur trouvé par le port, `null` si la valeur est libre.
 * @param refusal l'erreur à lever, construite sur le porteur trouvé.
 * @param isSelf `true` quand le porteur est l'objet qu'on modifie (rien à refuser).
 */
export function assertFree<T>(
  holder: T | null,
  refusal: (holder: T) => Error,
  isSelf: (holder: T) => boolean = () => false,
): void {
  if (holder !== null && !isSelf(holder)) {
    throw refusal(holder);
  }
}
