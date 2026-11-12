import type { CreateVolumeCommitmentPayload } from "@lfd/contracts";

/** **Signer** un engagement de volume pour un client. */
export class SignVolumeCommitmentCommand {
  constructor(
    readonly payload: CreateVolumeCommitmentPayload,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
