import type { CreateVolumeCommitmentPayload } from "@lfd/contracts";

/** **Signer** un engagement de volume pour un client. */
export class SignVolumeCommitmentCommand {
  constructor(
    readonly payload: CreateVolumeCommitmentPayload,
    readonly staffUserId: string,
  ) {}
}
