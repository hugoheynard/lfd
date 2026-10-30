/**
 * Reporter un engagement de volume de l'ancienne référence `fromSku` sur `toSku`, née d'un
 * détachement de celle-ci (`plan-report-apres-detachement.md`, § 2).
 */
export class CarryOverVolumeCommitmentCommand {
  constructor(
    readonly commitmentId: string,
    readonly fromSku: string,
    readonly toSku: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
