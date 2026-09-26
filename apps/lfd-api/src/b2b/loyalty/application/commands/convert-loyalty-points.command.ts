import type { LoyaltyHolderKind } from "../../domain/value-objects/loyalty-holder.js";

/**
 * Convertir des points en un bon de `steps` paliers entiers, pour le titulaire
 * désigné — la personne elle-même, ou la société de l'espace courant (plan D1).
 * Rend l'identifiant du bon émis.
 */
export class ConvertLoyaltyPointsCommand {
  constructor(
    readonly holderKind: LoyaltyHolderKind,
    readonly holderId: string,
    readonly actorUserId: string,
    readonly steps: number,
  ) {}
}
