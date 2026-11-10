import type { LoyaltyHolderKind } from "../../domain/value-objects/loyalty-holder.js";

/**
 * Convertir des points en un bon de `steps` paliers entiers, pour le titulaire
 * désigné — la personne elle-même, ou la société de l'espace courant (plan D1).
 * Rend l'identifiant du bon émis.
 *
 * `expectedBalancePoints` : le solde que l'écran du client affichait, relu et
 * comparé SOUS le verrou (plan des points, E1.1) ; `null` pour un appelant qui
 * n'en affiche pas. Le staff ne convertit pas (vérifié le 2026-09-27 : seule la
 * route `me/loyalty/conversions` construit cette commande hors des tests).
 */
export class ConvertLoyaltyPointsCommand {
  constructor(
    readonly holderKind: LoyaltyHolderKind,
    readonly holderId: string,
    readonly actorUserId: string,
    readonly steps: number,
    readonly expectedBalancePoints: number | null,
  ) {}
}
