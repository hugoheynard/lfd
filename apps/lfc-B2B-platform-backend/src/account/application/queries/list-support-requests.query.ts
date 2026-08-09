/**
 * La file **staff** des demandes de contact. `openOnly` par défaut : ce que le
 * commercial a à traiter, pas l'historique.
 */
export class ListSupportRequestsQuery {
  constructor(readonly openOnly: boolean) {}
}
