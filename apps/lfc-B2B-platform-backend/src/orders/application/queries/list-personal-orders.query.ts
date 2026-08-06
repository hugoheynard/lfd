/**
 * Liste les commandes **personnelles** du client (sans entreprise). Mur = le seul
 * `actorUserId` : on ne lit que ses propres commandes, jamais celles d'un autre.
 */
export class ListPersonalOrdersQuery {
  constructor(readonly actorUserId: string) {}
}
