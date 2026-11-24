import type { UpsertOccurrenceOverridePayload } from "@lfd/contracts";

/**
 * Déroge à **une échéance** d'un panier (« modifier cette commande
 * uniquement ») : la sauter, ou remplacer ses lignes. Mur : l'acheteur du
 * panier. `date` est le jour de service visé, `AAAA-MM-JJ`.
 */
export class OverrideOccurrenceCommand {
  constructor(
    readonly actorUserId: string,
    readonly basketId: string,
    readonly date: string,
    readonly payload: UpsertOccurrenceOverridePayload,
  ) {}
}
