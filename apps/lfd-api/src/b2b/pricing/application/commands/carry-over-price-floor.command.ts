/**
 * Reporter un plancher (une version, par son identifiant) de l'ancienne référence `fromSku` sur `toSku`, née d'un
 * détachement de celle-ci (`plan-report-apres-detachement.md`, § 2).
 */
export class CarryOverPriceFloorCommand {
  constructor(
    readonly floorId: string,
    readonly fromSku: string,
    readonly toSku: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
