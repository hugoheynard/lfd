import type { DepositStopFields } from "@lfd/contracts";

/**
 * **« Déposé avec preuve »** (`a-la-porte.md`, B2) — le dépôt sans
 * personne, sa photo, et la clôture de l'arrêt. `staffUserId` est le mur.
 */
export class DepositStopCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
    readonly fields: DepositStopFields,
    /** La photo, telle que reçue ; `null` : aucune — refusé par le domaine. */
    readonly photo: Buffer | null,
  ) {}
}
