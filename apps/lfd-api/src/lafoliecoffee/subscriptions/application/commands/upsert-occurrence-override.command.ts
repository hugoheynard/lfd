import type { UpsertOccurrenceOverridePayload } from "@lfd/contracts";

/**
 * Déroge à une **échéance précise** d'un panier récurrent (« modifier cette
 * commande uniquement »). Le mur est l'`actorUserId` : seul le propriétaire de
 * l'abonnement peut écrire une dérogation. La `date` est l'échéance visée.
 */
export class UpsertOccurrenceOverrideCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly subscriptionId: string,
    public readonly date: string,
    public readonly payload: UpsertOccurrenceOverridePayload,
  ) {}
}
