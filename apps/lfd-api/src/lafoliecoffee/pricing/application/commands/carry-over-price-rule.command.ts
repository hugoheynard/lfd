/**
 * Reporter une règle de prix de l'ancienne référence `fromSku` sur `toSku`, née d'un
 * détachement de celle-ci (`saisir-un-prix.md`, § 4).
 */
export class CarryOverPriceRuleCommand {
  constructor(
    readonly ruleId: string,
    readonly fromSku: string,
    readonly toSku: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
