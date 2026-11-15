/**
 * **Lancer un réassort « au plus tôt »** (R4a,
 * `documentation/reassort-boutiques/au-plus-tot.md`) — le fournil
 * l'ajoute au plan du jour, sous le verrou de la journée.
 */
export class LaunchResupplyCommand {
  constructor(
    /** `AAAA-MM-JJ` — la journée visée par le réassort, le jour même. */
    readonly serviceDay: string,
    /** L'identifiant OPAQUE du réassort au commerce. */
    readonly resupplyId: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
