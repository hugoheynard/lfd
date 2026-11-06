import type { StaffStatusChange } from "@lfd/contracts";

/**
 * Suspendre une personne, ou la réintégrer.
 *
 * Le mur d'autorisation garde un cache court par `sub` : une suspension est donc
 * ressentie dans la seconde, pas à l'instant. C'est le prix assumé d'un annuaire
 * qu'on ne relit pas à chaque clic — et trente secondes valent mieux que l'heure
 * de vie d'un jeton.
 */
export class SetStaffStatusCommand {
  constructor(
    readonly id: string,
    readonly change: StaffStatusChange,
    readonly actorId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne réexécute rien ; un vrai renvoi en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}
