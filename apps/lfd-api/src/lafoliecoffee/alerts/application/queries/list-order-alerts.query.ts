/** Requête **staff** : les alertes d'une page de commandes (plan du visa, V4). */
export class ListOrderAlertsQuery {
  constructor(readonly orderIds: readonly string[]) {}
}
