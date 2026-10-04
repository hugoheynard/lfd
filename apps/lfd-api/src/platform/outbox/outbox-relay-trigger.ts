/**
 * Port du **chemin rapide** : réveiller le relais une fois un fait durable
 * validé. Séparé du relais pour que le publieur ne dépende que de ce geste.
 */
export abstract class OutboxRelayTrigger {
  abstract wake(): void;
}
