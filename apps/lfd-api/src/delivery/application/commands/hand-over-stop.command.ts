import type { HandOverStopFields } from "@lfd/contracts";

/**
 * **« Remis au client »** (`plan-a-la-porte.md`, B1) — la remise à la porte,
 * ses pièces, et la clôture de l'arrêt. `staffUserId` est le mur.
 */
export class HandOverStopCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
    readonly fields: HandOverStopFields,
    /** La photo, telle que reçue ; `null` : aucune — refusé par le domaine. */
    readonly photo: Buffer | null,
    /** La signature au doigt, en image ; `null` : aucune. */
    readonly signature: Buffer | null,
  ) {}
}
