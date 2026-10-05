/**
 * Le verrou de **constitution**, par entité : deux constitutions concurrentes
 * d'une même entité se suivent au lieu de se croiser. Pris DANS l'unité de
 * travail, relâché à sa fin (`pg_advisory_xact_lock`).
 *
 * Aucun verrou n'est demandé à la passation : une commande validée après la
 * constitution n'a pas de ligne et entre au lot suivant (plan §3, voulu).
 */
export abstract class CollectionLock {
  abstract acquire(legalEntityId: string): Promise<void>;
}
